import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMcpServer } from '../support/mcp.js';
import { registerHistoryPack as createHistoryPack } from '../../dist/src/mcp/tool-packs/history/index.js';

describe('history tool pack', () => {
  it('registers the session lineage tools through the kernel', async () => {
    const server = await buildMcpServer({ toolPacks: [createHistoryPack] });

    const schemas = await server.getToolSchemas();
    assert.deepEqual(
      schemas.map((schema) => schema.name),
      [
        'fork_session',
        'list_lineage',
        'list_checkpoints',
        'restore_checkpoint',
        'instantiate_session_blueprint',
        'list_session_blueprints',
      ]
    );
  });
});
