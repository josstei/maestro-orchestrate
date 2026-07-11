import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMcpServer } from '../support/mcp.js';
import { registerHistoryPack as createHistoryPack } from '../../dist/src/mcp/tool-packs/history/index.js';

const EXPECTED_HISTORY_TOOLS = [
  {
    name: 'fork_session',
    description:
      'Fork an archived Maestro session into a new active session, recording parent_session_id and an optional branch label.',
  },
  {
    name: 'list_lineage',
    description:
      'Return a session parent and direct children by scanning the active session and archived sessions.',
  },
  {
    name: 'list_checkpoints',
    description:
      'List append-only per-phase checkpoints captured for an active Maestro session.',
  },
  {
    name: 'restore_checkpoint',
    description:
      'Restore a captured phase checkpoint by transforming future phases back to pending state.',
  },
  {
    name: 'instantiate_session_blueprint',
    description:
      'Instantiate an authored session blueprint into create_session-compatible phases for a concrete task.',
  },
  {
    name: 'list_session_blueprints',
    description:
      'List authored session blueprints that can be instantiated into a ready-to-validate plan.',
  },
];

const HISTORY_TOOL_ARGS = {
  fork_session: { source_session_id: 'source', new_session_id: 'fork' },
  list_lineage: { session_id: 'session' },
  list_checkpoints: { session_id: 'session' },
  restore_checkpoint: { session_id: 'session', phase_id: 1 },
  instantiate_session_blueprint: { blueprint_id: 'feature-delivery', task: 'Pilot' },
  list_session_blueprints: {},
};

describe('history tool pack', () => {
  it('preserves the history tool order and public descriptions', async (t) => {
    const server = await buildMcpServer({ testContext: t, toolPacks: [createHistoryPack] });

    const schemas = await server.getToolSchemas();
    assert.deepEqual(
      schemas.map(({ name, description }) => ({ name, description })),
      EXPECTED_HISTORY_TOOLS,
    );
  });

  it('workspace-gates all six tools, including args-only blueprint projections', async (t) => {
    const server = await buildMcpServer({ testContext: t, toolPacks: [createHistoryPack] });

    for (const { name } of EXPECTED_HISTORY_TOOLS) {
      const outcome = await server.callTool(name, HISTORY_TOOL_ARGS[name]);
      assert.equal(outcome.ok, false, name);
      assert.equal(outcome.code, 'WORKSPACE_NOT_INITIALIZED', name);
    }
  });
});
