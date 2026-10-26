'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createToolPack } = require('../../src/mcp/tool-packs/session');
const { writeTree } = require('../support/fs');
const { activeSessionPath, readSessionState } = require('../support/session-file');
const { SessionWorkspace, packServer, phase, singlePhase } = require('../support/session-server');

describe('session tool pack', () => {
  it('registers the session lifecycle tools through the kernel', () => {
    const server = packServer([createToolPack]);

    assert.deepEqual(
      server.getToolSchemas().map((schema) => schema.name),
      [
        'create_session',
        'get_session_status',
        'update_session',
        'transition_phase',
        'archive_session',
        'enter_design_gate',
        'record_design_approval',
        'get_design_gate_status',
        'scan_phase_changes',
        'reconcile_phase',
      ]
    );
  });

  it('creates, updates, and transitions session state on disk', async () => {
    const workspace = await SessionWorkspace.create();
    writeTree(workspace.dir, 'docs/maestro/plans/design.md', '# Design\n');
    writeTree(workspace.dir, 'docs/maestro/plans/plan.md', '# Plan\n');

    const createResult = await workspace.createSession('test-session', {
      design_document: 'docs/maestro/plans/design.md',
      implementation_plan: 'docs/maestro/plans/plan.md',
      phases: [phase(1), phase(2, { blocked_by: [1] })],
    });

    assert.equal(createResult.ok, true);

    const updateResult = await workspace.call('update_session', {
      session_id: 'test-session',
      execution_mode: 'sequential',
      execution_backend: 'native',
    });

    assert.equal(updateResult.ok, true);

    const transitionResult = await workspace.transition('test-session', 1, {
      next_phase_id: 2,
      files_created: ['src/generated.js'],
      files_modified: ['src/existing.js'],
      downstream_context: {
        key_interfaces_introduced: ['createServer(options)'],
        patterns_established: ['pack-based composition'],
        integration_points: ['session pack'],
        assumptions: ['phases are sequential'],
        warnings: [],
      },
    });

    assert.equal(transitionResult.ok, true);
    assert.deepEqual(transitionResult.result.session_state_summary.completed_phases, [
      1,
    ]);

    const sessionState = readSessionState(workspace.dir);
    assert.equal(sessionState.execution_mode, 'sequential');
    assert.equal(sessionState.current_phase, 2);
    assert.deepEqual(sessionState.phases[0].files_created, ['src/generated.js']);
    assert.deepEqual(sessionState.phases[0].files_modified, ['src/existing.js']);
    assert.equal(sessionState.phases[1].status, 'in_progress');
  });

  it('rejects create_session when a phase is missing required fields', async () => {
    const workspace = await SessionWorkspace.create();

    const outcome = await workspace.createSession('bad-plan', { phases: [{ id: 1, name: 'Only id/name' }] });

    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /missing_required_field|agent|parallel|blocked_by/i);
  });

  it('preserves string phase ids end-to-end through create_session and transition_phase', async () => {
    const workspace = await SessionWorkspace.create();

    const createResult = await workspace.createSession('string-id-test', {
      phases: [phase('design', { agent: 'architect' }), phase('impl', { blocked_by: ['design'] })],
    });
    assert.equal(createResult.ok, true);

    const session = readSessionState(workspace.dir);
    assert.equal(session.current_phase, 'design');
    assert.equal(session.phases[0].id, 'design');
    assert.equal(session.phases[1].id, 'impl');
    assert.deepEqual(session.phases[1].blocked_by, ['design']);

    const transitionResult = await workspace.transition('string-id-test', 'design', {
      next_phase_id: 'impl',
      downstream_context: {
        key_interfaces_introduced: [],
        patterns_established: [],
        integration_points: [],
        assumptions: [],
        warnings: [],
      },
    });
    assert.equal(transitionResult.ok, true);
    assert.deepEqual(
      transitionResult.result.session_state_summary.completed_phases,
      ['design']
    );
    assert.equal(transitionResult.result.session_state_summary.current_phase, 'impl');
  });

  it('archives the active session and associated plan files', async () => {
    const workspace = await SessionWorkspace.create();

    writeTree(workspace.dir, 'docs/maestro/plans/design.md', '# design\n');
    writeTree(workspace.dir, 'docs/maestro/plans/plan.md', '# plan\n');

    await workspace.createSession('archive-session', {
      design_document: 'docs/maestro/plans/design.md',
      implementation_plan: 'docs/maestro/plans/plan.md',
    });

    const archiveResult = await workspace.call('archive_session', { session_id: 'archive-session' });

    assert.equal(archiveResult.ok, true);
    assert.equal(fs.existsSync(activeSessionPath(workspace.dir)), false);
    for (const archived of ['state/archive/archive-session.md', 'plans/archive/design.md', 'plans/archive/plan.md']) {
      assert.equal(fs.existsSync(path.join(workspace.dir, 'docs/maestro', archived)), true, archived);
    }
  });

  for (const [tool, args] of [
    ['transition_phase', { completed_phase_id: 1 }],
    ['update_session', { execution_mode: 'sequential' }],
    ['reconcile_phase', { phase_id: 1, files_created: ['src/foo.js'] }],
  ]) {
    it(`${tool} rejects another session's id and leaves the session file untouched`, async () => {
      const workspace = await SessionWorkspace.create();
      await workspace.createSession('active-session');
      const before = fs.readFileSync(activeSessionPath(workspace.dir), 'utf8');

      const outcome = await workspace.call(tool, { session_id: 'other-session', ...args });

      assert.equal(outcome.ok, false);
      assert.equal(outcome.code, 'STATE_ERROR');
      assert.equal(outcome.error, "Session mismatch: active session is 'active-session', got 'other-session'");
      assert.equal(fs.readFileSync(activeSessionPath(workspace.dir), 'utf8'), before);
    });
  }

  it('archive_session blocks when a phase requires reconciliation', async () => {
    const workspace = await SessionWorkspace.create();

    await workspace.createSession('arch-rec', { phases: singlePhase(['src/foo.js']) });

    await workspace.transition('arch-rec', 1);

    const outcome = await workspace.call('archive_session', { session_id: 'arch-rec' });
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /reconciliation/i);
  });
});
