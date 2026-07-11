import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as markdownState from '../../dist/src/core/markdown-state.js';
import {
  archiveSession,
  createSession,
  getSessionStatus,
  updateSession,
} from '../../dist/src/mcp/session/session-lifecycle-service.js';
import {
  ReadableSessionStateSchema,
  SessionIdSchema,
  SessionStateSchema,
} from '../../dist/src/mcp/contracts/session-state-schema.js';
import { migrateSessionState } from '../../dist/src/mcp/handlers/session-migrations.js';
import {
  createEmptySessionTokenUsage,
  createPendingPhaseState,
} from '../../dist/src/mcp/session/session-state-factory.js';
import { sessionStore } from '../../dist/src/mcp/session/session-store.js';
import {
  ensureMaestroWorkspace,
  makeTempWorkspace,
  phaseFixture,
  readSessionFrontmatter,
} from '../support/mcp.js';

describe('session lifecycle service', () => {
  it('creates, reports, updates, and archives a session through the service boundary', () => {
    const workspace = ensureMaestroWorkspace(makeTempWorkspace('maestro-session-lifecycle-'));

    const created = createSession(
      {
        session_id: 'service-session',
        task: 'service boundary',
        task_complexity: 'medium',
        phases: [
          phaseFixture({ id: 1, name: 'Phase 1', blocked_by: [] }),
          phaseFixture({ id: 2, name: 'Phase 2', blocked_by: [1] }),
        ],
      },
      workspace
    );

    assert.equal(created.success, true);
    assert.equal(fs.existsSync(created.path), true);

    const createdState = readSessionFrontmatter(workspace);
    assert.deepEqual(SessionStateSchema.parse(createdState), createdState);

    const status = getSessionStatus({}, workspace);
    assert.equal(status.exists, true);
    assert.equal(status.session_id, 'service-session');
    assert.equal(status.current_phase, 1);

    const updated = updateSession(
      {
        session_id: 'service-session',
        execution_mode: 'parallel',
        current_batch: 'batch-1',
      },
      workspace
    );
    assert.deepEqual(updated.updated_fields, ['execution_mode', 'current_batch']);

    const archived = archiveSession({ session_id: 'service-session' }, workspace);
    assert.equal(archived.success, true);
    assert.equal(fs.existsSync(archived.archive_path), true);
    assert.equal(
      fs.existsSync(path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md')),
      false
    );
  });
});

describe('current session contracts and factories', () => {
  it('adapts parseSessionId failure to an exact Zod issue', () => {
    const result = SessionIdSchema.safeParse('bad!id');
    assert.equal(result.success, false);
    assert.equal(
      result.error.issues[0].message,
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
    assert.equal(result.error.issues[0].code, 'custom');
  });

  it('constructs canonical pending phases and fresh empty token usage', () => {
    const phase = createPendingPhaseState({
      id: 'phase-a',
      name: 'Phase A',
      agents: ['coder'],
      parallel: true,
      blockedBy: [],
      plannedFiles: ['src/a.ts'],
    });

    assert.deepEqual(phase, {
      id: 'phase-a',
      name: 'Phase A',
      status: 'pending',
      agents: ['coder'],
      parallel: true,
      started: null,
      completed: null,
      blocked_by: [],
      files_created: [],
      files_modified: [],
      files_deleted: [],
      planned_files: ['src/a.ts'],
      downstream_context: {
        key_interfaces_introduced: [],
        patterns_established: [],
        integration_points: [],
        assumptions: [],
        warnings: [],
      },
      errors: [],
      retry_count: 0,
      blocker_count: 0,
      review_finding_count: 0,
    });

    const firstUsage = createEmptySessionTokenUsage();
    const secondUsage = createEmptySessionTokenUsage();
    firstUsage.by_agent.coder = { input: 1 };
    assert.deepEqual(secondUsage, {
      total_input: 0,
      total_output: 0,
      total_cached: 0,
      by_agent: {},
    });
  });

  it('reads supported migrated legacy state and retains unknown fields', () => {
    const migrated = migrateSessionState({
      session_id: 'legacy-session',
      status: 'completed',
      phases: [{
        id: 1,
        name: 'Legacy phase',
        status: 'completed',
        agents: ['coder'],
        legacy_phase_field: { retained: true },
      }],
      legacy_session_field: ['retained'],
    });

    const readable = ReadableSessionStateSchema.parse(migrated);
    assert.deepEqual(readable.legacy_session_field, ['retained']);
    assert.deepEqual(readable.phases[0].legacy_phase_field, { retained: true });
    assert.equal(readable.current_phase, undefined);
    assert.equal(readable.total_phases, undefined);
  });

  it('rejects structurally unreadable state and unknown fields on strict writes', () => {
    assert.throws(() => ReadableSessionStateSchema.parse({}));

    const workspace = ensureMaestroWorkspace(makeTempWorkspace('maestro-session-strict-'));
    createSession(
      {
        session_id: 'strict-session',
        task: 'strict state',
        phases: [phaseFixture()],
      },
      workspace
    );
    const state = readSessionFrontmatter(workspace);
    assert.throws(() => SessionStateSchema.parse({ ...state, future_field: true }));
  });
});

describe('session store boundary', () => {
  it('validates new state strictly before writing and reads migrated unknown fields tolerantly', () => {
    const workspace = ensureMaestroWorkspace(makeTempWorkspace('maestro-session-store-'));
    const created = createSession(
      {
        session_id: 'store-session',
        task: 'store boundary',
        phases: [phaseFixture()],
      },
      workspace
    );
    const originalContent = fs.readFileSync(created.path, 'utf8');
    const state = readSessionFrontmatter(workspace);

    assert.throws(() => {
      sessionStore.create(
        workspace,
        { ...state, future_current_field: true },
        '# replacement\n'
      );
    });
    assert.equal(fs.readFileSync(created.path, 'utf8'), originalContent);

    const futureState = {
      ...state,
      future_session_field: { retained: true },
      phases: state.phases.map((phase) => ({
        ...phase,
        future_phase_field: ['retained'],
      })),
    };
    fs.writeFileSync(
      created.path,
      markdownState.serialize(futureState, '# retained body\n')
    );

    const document = sessionStore.read(workspace);
    assert.deepEqual(document.state.future_session_field, { retained: true });
    assert.deepEqual(document.state.phases[0].future_phase_field, ['retained']);
    assert.equal(document.body, '# retained body\n');

    updateSession(
      { session_id: 'store-session', execution_mode: 'sequential' },
      workspace
    );
    const updated = sessionStore.read(workspace);
    assert.deepEqual(updated.state.future_session_field, { retained: true });
    assert.deepEqual(updated.state.phases[0].future_phase_field, ['retained']);
  });

  it('requires explicit mutation outcomes and preserves or overrides the body deliberately', () => {
    const workspace = ensureMaestroWorkspace(makeTempWorkspace('maestro-session-mutation-'));
    createSession(
      {
        session_id: 'mutation-session',
        task: 'mutation boundary',
        phases: [phaseFixture()],
      },
      workspace
    );

    assert.throws(
      () => sessionStore.update(
        workspace,
        'mutation-session',
        ({ state }) => {
          state.current_batch = 'silently-dropped';
        }
      ),
      (error) => error.code === 'INVALID_SESSION_MUTATION'
    );
    assert.equal(sessionStore.read(workspace).state.current_batch, null);

    const readOnly = sessionStore.update(
      workspace,
      'mutation-session',
      ({ state }) => {
        state.current_batch = 'read-only';
        return { response: 'not-written', writeBack: false };
      }
    );
    assert.equal(readOnly, 'not-written');
    assert.equal(sessionStore.read(workspace).state.current_batch, null);

    sessionStore.update(
      workspace,
      'mutation-session',
      ({ state }) => {
        state.current_batch = 'written';
        return { response: null, writeBack: true };
      }
    );
    assert.equal(sessionStore.read(workspace).body, '# mutation boundary Orchestration Log\n');

    sessionStore.update(
      workspace,
      'mutation-session',
      () => ({ response: null, writeBack: true, body: '# overridden\n' })
    );
    assert.equal(sessionStore.read(workspace).body, '# overridden\n');

    sessionStore.update(
      workspace,
      'mutation-session',
      () => ({ response: null, writeBack: true, body: undefined })
    );
    assert.equal(sessionStore.read(workspace).body, '');
  });
});
