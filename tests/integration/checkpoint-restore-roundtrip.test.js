import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerHistoryPack as createHistoryPack } from '../../dist/src/mcp/tool-packs/history/index.js';

import {
  createInitializedMcpWorkspace,
  createSessionPack,
  createWorkspacePack,
  phaseFixture,
  readSessionFrontmatter,
} from '../support/mcp.js';

const SESSION_ID = 'checkpoint-roundtrip';

function context(label) {
  return {
    integration_points: [`${label} integration`],
    patterns_established: [`${label} pattern`],
  };
}

async function createRoundTripSession(testContext) {
  const { server, workspace } = await createInitializedMcpWorkspace({
    prefix: 'maestro-checkpoint-restore-',
    testContext,
    toolPacks: [createWorkspacePack, createSessionPack, createHistoryPack],
  });

  const created = await server.callTool(
    'create_session',
    {
      session_id: SESSION_ID,
      task: 'checkpoint restore round trip',
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

describe('checkpoint restore round trip', () => {
  it('restores a phase checkpoint as a post-load transform', async (t) => {
    const { server, workspace } = await createRoundTripSession(t);

    const phaseOne = await server.callTool(
      'transition_phase',
      {
        session_id: SESSION_ID,
        completed_phase_id: 1,
        next_phase_id: 2,
        downstream_context: context('phase 1'),
      },
      workspace
    );
    assert.equal(phaseOne.ok, true, phaseOne.error || '');

    const phaseTwo = await server.callTool(
      'transition_phase',
      {
        session_id: SESSION_ID,
        completed_phase_id: 2,
        next_phase_id: 3,
        downstream_context: context('phase 2'),
      },
      workspace
    );
    assert.equal(phaseTwo.ok, true, phaseTwo.error || '');

    const listed = await server.callTool(
      'list_checkpoints',
      { session_id: SESSION_ID },
      workspace
    );
    assert.equal(listed.ok, true, listed.error || '');
    assert.deepEqual(
      listed.result.checkpoints.map((checkpoint) => checkpoint.phase_id),
      [1, 2]
    );

    const restored = await server.callTool(
      'restore_checkpoint',
      { session_id: SESSION_ID, phase_id: 1 },
      workspace
    );
    assert.equal(restored.ok, true, restored.error || '');
    assert.equal(restored.result.current_phase, 2);

    const state = readSessionFrontmatter(workspace);
    assert.equal(state.current_phase, 2);
    assert.equal(state.phases[0].status, 'completed');
    assert.equal(state.phases[1].status, 'pending');
    assert.equal(state.phases[2].status, 'pending');
    assert.deepEqual(state.phases[1].files_created, []);
    assert.deepEqual(state.phases[1].files_modified, []);
    assert.deepEqual(state.phases[1].files_deleted, []);
    assert.equal(state.phases[1].started, null);
    assert.equal(state.phases[1].completed, null);
  });
});
