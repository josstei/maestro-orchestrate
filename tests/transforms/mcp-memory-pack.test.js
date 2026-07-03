const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildMcpServer } = require('../support/mcp');
const { createToolPack: createMemoryPack } = require('../../src/mcp/tool-packs/memory');

describe('memory tool pack', () => {
  it('registers the memory profile tools through the kernel', () => {
    const server = buildMcpServer({ toolPacks: [createMemoryPack] });

    assert.deepEqual(
      server.getToolSchemas().map((schema) => schema.name),
      ['get_project_profile', 'update_project_profile', 'record_validation_commands']
    );
  });
});
