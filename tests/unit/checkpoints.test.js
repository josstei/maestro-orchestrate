import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseSessionState } from '../../dist/src/mcp/handlers/session-state-core.js';
import { handleListCheckpoints } from '../../dist/src/mcp/handlers/checkpoints.js';
import { resetPhaseToPending } from '../../dist/src/mcp/session/session-state-factory.js';
import { createInitializedMcpWorkspace, phaseFixture } from '../support/mcp.js';
const SESSION_ID = 'checkpoint-session';

function checkpointPath(workspace, phaseId) {
  return path.join(
    workspace,
    'docs',
    'maestro',
    'state',
    'checkpoints',
    SESSION_ID,
    `phase-${phaseId}.md`
  );
}

function populatedContext(label) {
  return {
    integration_points: [`${label} integration`],
    patterns_established: [`${label} pattern`],
  };
}

async function createThreePhaseSession() {
  const { server, workspace } = await createInitializedMcpWorkspace({
    runtime: 'codex',
    prefix: 'maestro-checkpoints-',
  });

  const created = await server.callTool(
    'create_session',
    {
      session_id: SESSION_ID,
      task: 'checkpoint behavior',
      task_complexity: 'medium',
      phases: [
        phaseFixture({ id: 1, name: 'Phase 1', blocked_by: [] }),
        phaseFixture({ id: 2, name: 'Phase 2', blocked_by: [1] }),
        phaseFixture({ id: 3, name: 'Phase 3', blocked_by: [2] }),
      ],
    },
    workspace
  );

  assert.equal(created.ok, true, created.error || '');
  return { server, workspace };
}

describe('session checkpoints', () => {
  it('captures append-only phase checkpoints and lists them sorted', async () => {
    const { server, workspace } = await createThreePhaseSession();

    const firstTransition = await server.callTool(
      'transition_phase',
      {
        session_id: SESSION_ID,
        completed_phase_id: 1,
        next_phase_id: 2,
        downstream_context: populatedContext('phase 1'),
      },
      workspace
    );
    assert.equal(firstTransition.ok, true, firstTransition.error || '');

    const phaseOnePath = checkpointPath(workspace, 1);
    assert.equal(fs.existsSync(phaseOnePath), true);
    const phaseOneContent = fs.readFileSync(phaseOnePath, 'utf8');
    const phaseOneSnapshot = parseSessionState(phaseOneContent);
    assert.equal(phaseOneSnapshot.session_id, SESSION_ID);
    assert.equal(phaseOneSnapshot.phases[0].status, 'completed');
    assert.equal(phaseOneSnapshot.phases[1].status, 'in_progress');

    const secondTransition = await server.callTool(
      'transition_phase',
      {
        session_id: SESSION_ID,
        completed_phase_id: 2,
        next_phase_id: 3,
        downstream_context: populatedContext('phase 2'),
      },
      workspace
    );
    assert.equal(secondTransition.ok, true, secondTransition.error || '');

    const phaseTwoPath = checkpointPath(workspace, 2);
    assert.equal(fs.existsSync(phaseTwoPath), true);
    assert.equal(fs.readFileSync(phaseOnePath, 'utf8'), phaseOneContent);

    const phaseTwoSnapshot = parseSessionState(
      fs.readFileSync(phaseTwoPath, 'utf8')
    );
    assert.equal(phaseTwoSnapshot.session_id, SESSION_ID);
    assert.equal(phaseTwoSnapshot.phases[0].status, 'completed');
    assert.equal(phaseTwoSnapshot.phases[1].status, 'completed');
    assert.equal(phaseTwoSnapshot.phases[2].status, 'in_progress');

    const listed = handleListCheckpoints({ session_id: SESSION_ID }, workspace);
    assert.deepEqual(
      listed.checkpoints.map((checkpoint) => checkpoint.phase_id),
      [1, 2]
    );
    assert.deepEqual(
      listed.checkpoints.map((checkpoint) => checkpoint.path),
      [phaseOnePath, phaseTwoPath]
    );
  });

  it('resets exactly checkpoint progress while preserving phase metadata', () => {
    const original = {
      id: 2,
      name: 'Phase 2',
      status: 'completed',
      agents: ['coder'],
      parallel: true,
      started: '2026-07-01T00:00:00.000Z',
      completed: '2026-07-01T00:10:00.000Z',
      blocked_by: [1],
      files_created: ['created.ts'],
      files_modified: ['modified.ts'],
      files_deleted: ['deleted.ts'],
      planned_files: ['planned.ts'],
      downstream_context: populatedContext('completed'),
      errors: ['old error'],
      retry_count: 2,
      blocker_count: 3,
      review_finding_count: 4,
      requires_reconciliation: true,
      reconciliation_reason: 'preserved metadata',
      duration_ms: 600000,
      token_usage: { input: 10, output: 20, cached: 5 },
      future_extension: { retained: true },
    };

    const reset = resetPhaseToPending(original);

    assert.equal(reset.status, 'pending');
    assert.equal(reset.started, null);
    assert.equal(reset.completed, null);
    assert.deepEqual(reset.files_created, []);
    assert.deepEqual(reset.files_modified, []);
    assert.deepEqual(reset.files_deleted, []);
    assert.deepEqual(reset.downstream_context, {
      key_interfaces_introduced: [],
      patterns_established: [],
      integration_points: [],
      assumptions: [],
      warnings: [],
    });
    assert.deepEqual(reset.errors, []);
    assert.equal(reset.retry_count, 0);
    assert.equal(reset.blocker_count, 0);
    assert.equal(reset.review_finding_count, 0);
    assert.equal(reset.requires_reconciliation, false);
    assert.equal(Object.hasOwn(reset, 'duration_ms'), false);
    assert.equal(Object.hasOwn(reset, 'token_usage'), false);

    assert.equal(reset.id, original.id);
    assert.equal(reset.name, original.name);
    assert.deepEqual(reset.agents, original.agents);
    assert.equal(reset.parallel, original.parallel);
    assert.deepEqual(reset.blocked_by, original.blocked_by);
    assert.deepEqual(reset.planned_files, original.planned_files);
    assert.equal(reset.reconciliation_reason, original.reconciliation_reason);
    assert.deepEqual(reset.future_extension, original.future_extension);
  });
});
