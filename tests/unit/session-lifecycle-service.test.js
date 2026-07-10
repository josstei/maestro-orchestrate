import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
