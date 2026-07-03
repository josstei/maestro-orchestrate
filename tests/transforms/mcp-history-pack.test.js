const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildMcpServer } = require('../support/mcp');
const {
  createToolPack: createHistoryPack,
} = require('../../src/mcp/tool-packs/history');

describe('history tool pack', () => {
  it('registers the session lineage tools through the kernel', () => {
    const server = buildMcpServer({ toolPacks: [createHistoryPack] });

    assert.deepEqual(
      server.getToolSchemas().map((schema) => schema.name),
      ['fork_session', 'list_lineage']
    );
  });
});
