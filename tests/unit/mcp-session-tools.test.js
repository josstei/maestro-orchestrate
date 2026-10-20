'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createServer } = require('../../src/mcp/core/create-server');
const { tools } = require('../../src/mcp/tools/session');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { ensureWorkspace } = require('../../src/state/session-state');
const { makeTempDir } = require('../support/fs');
const { activeSessionPath, readSessionState } = require('../support/session-file');

function setup(prefix) {
  const projectRoot = makeTempDir(prefix);
  ensureWorkspace('docs/maestro', projectRoot);
  // The session tools use neither the runtime config nor the workspace cache.
  const server = createServer({ runtimeConfig: getRuntimeConfig('codex'), workspace: null, tools });
  return { projectRoot, server };
}

describe('session tools', () => {
  it('creates, updates, and transitions session state on disk', async () => {
    const { projectRoot, server } = setup('maestro-session-');
    fs.writeFileSync(path.join(projectRoot, 'docs/maestro/plans/design.md'), '# Design\n');
    fs.writeFileSync(path.join(projectRoot, 'docs/maestro/plans/plan.md'), '# Plan\n');

    const createResult = await server.callTool(
      'create_session',
      {
        session_id: 'test-session',
        task: 'Test session lifecycle',
        task_complexity: 'complex',
        design_document: 'docs/maestro/plans/design.md',
        implementation_plan: 'docs/maestro/plans/plan.md',
        phases: [
          { id: 1, name: 'Phase 1', agent: 'coder', parallel: false, blocked_by: [] },
          { id: 2, name: 'Phase 2', agent: 'coder', parallel: false, blocked_by: [1] },
        ],
      },
      projectRoot
    );

    assert.equal(createResult.ok, true);

    const updateResult = await server.callTool(
      'update_session',
      {
        session_id: 'test-session',
        execution_mode: 'sequential',
        execution_backend: 'native',
      },
      projectRoot
    );

    assert.equal(updateResult.ok, true);

    const transitionResult = await server.callTool(
      'transition_phase',
      {
        session_id: 'test-session',
        completed_phase_id: 1,
        next_phase_id: 2,
        files_created: ['src/generated.js'],
        files_modified: ['src/existing.js'],
        downstream_context: {
          key_interfaces_introduced: ['createServer(options)'],
          patterns_established: ['static tool lists'],
          integration_points: ['session tools'],
          assumptions: ['phases are sequential'],
          warnings: [],
        },
      },
      projectRoot
    );

    assert.equal(transitionResult.ok, true);
    assert.deepEqual(transitionResult.result.session_state_summary.completed_phases, [
      1,
    ]);

    const sessionState = readSessionState(projectRoot);
    assert.equal(sessionState.execution_mode, 'sequential');
    assert.equal(sessionState.current_phase, 2);
    assert.deepEqual(sessionState.phases[0].files_created, ['src/generated.js']);
    assert.deepEqual(sessionState.phases[0].files_modified, ['src/existing.js']);
    assert.equal(sessionState.phases[1].status, 'in_progress');
  });

  it('rejects create_session when a phase is missing required fields', async () => {
    const { projectRoot, server } = setup('maestro-session-');

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'bad-plan',
        task: 'missing field test',
        phases: [{ id: 1, name: 'Only id/name' }],
      },
      projectRoot
    );

    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /missing_required_field|agent|parallel|blocked_by/i);
  });

  it('preserves string phase ids end-to-end through create_session and transition_phase', async () => {
    const { projectRoot, server } = setup('maestro-string-id-');

    const createResult = await server.callTool(
      'create_session',
      {
        session_id: 'string-id-test',
        task: 'string-id round-trip',
        task_complexity: 'simple',
        phases: [
          {
            id: 'design',
            name: 'Design phase',
            agent: 'architect',
            parallel: false,
            blocked_by: [],
          },
          {
            id: 'impl',
            name: 'Implementation phase',
            agent: 'coder',
            parallel: false,
            blocked_by: ['design'],
          },
        ],
      },
      projectRoot
    );
    assert.equal(createResult.ok, true);

    const session = readSessionState(projectRoot);
    assert.equal(session.current_phase, 'design');
    assert.equal(session.phases[0].id, 'design');
    assert.equal(session.phases[1].id, 'impl');
    assert.deepEqual(session.phases[1].blocked_by, ['design']);

    const transitionResult = await server.callTool(
      'transition_phase',
      {
        session_id: 'string-id-test',
        completed_phase_id: 'design',
        next_phase_id: 'impl',
        files_created: [],
        files_modified: [],
        files_deleted: [],
        downstream_context: {
          key_interfaces_introduced: [],
          patterns_established: [],
          integration_points: [],
          assumptions: [],
          warnings: [],
        },
      },
      projectRoot
    );
    assert.equal(transitionResult.ok, true);
    assert.deepEqual(
      transitionResult.result.session_state_summary.completed_phases,
      ['design']
    );
    assert.equal(transitionResult.result.session_state_summary.current_phase, 'impl');
  });

  it('archives the active session and associated plan files', async () => {
    const { projectRoot, server } = setup('maestro-archive-');

    const designPath = path.join(projectRoot, 'docs/maestro/plans/design.md');
    const planPath = path.join(projectRoot, 'docs/maestro/plans/plan.md');
    fs.writeFileSync(designPath, '# design\n');
    fs.writeFileSync(planPath, '# plan\n');

    await server.callTool(
      'create_session',
      {
        session_id: 'archive-session',
        task: 'Archive test',
        design_document: 'docs/maestro/plans/design.md',
        implementation_plan: 'docs/maestro/plans/plan.md',
        phases: [{ id: 1, name: 'Phase 1', agent: 'coder', parallel: false, blocked_by: [] }],
      },
      projectRoot
    );

    const archiveResult = await server.callTool(
      'archive_session',
      { session_id: 'archive-session' },
      projectRoot
    );

    assert.equal(archiveResult.ok, true);
    assert.equal(fs.existsSync(activeSessionPath(projectRoot)), false);
    assert.equal(
      fs.existsSync(
        path.join(
          projectRoot,
          'docs/maestro/state/archive/archive-session.md'
        )
      ),
      true
    );
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'docs/maestro/plans/archive/design.md')),
      true
    );
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'docs/maestro/plans/archive/plan.md')),
      true
    );
  });

  it('archive_session blocks when a phase requires reconciliation', async () => {
    const { projectRoot, server } = setup('maestro-archive-');

    await server.callTool(
      'create_session',
      {
        session_id: 'arch-rec',
        task: 'archive reconciliation test',
        task_complexity: 'simple',
        phases: [
          {
            id: 1,
            name: 'Phase 1',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
            files: ['src/foo.js'],
          },
        ],
      },
      projectRoot
    );

    await server.callTool(
      'transition_phase',
      {
        session_id: 'arch-rec',
        completed_phase_id: 1,
        files_created: [],
        files_modified: [],
        files_deleted: [],
        downstream_context: {},
      },
      projectRoot
    );

    const outcome = await server.callTool(
      'archive_session',
      { session_id: 'arch-rec' },
      projectRoot
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /reconciliation/i);
  });
});
