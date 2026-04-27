'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../../src/mcp/core/create-server');
const { createToolPack: createContentPack } = require('../../src/mcp/tool-packs/content');

function createServerForWorkspace() {
  return createServer({
    runtimeConfig: { name: 'gemini' },
    services: {},
    toolPacks: [createContentPack],
  });
}

describe('get_agent_recommendation MCP tool', () => {
  it('returns security-engineer for an authentication + crypto deliverable', async () => {
    const server = createServerForWorkspace();
    const result = await server.callTool(
      'get_agent_recommendation',
      { phase_deliverable: 'implement the user authentication endpoint with crypto encryption and security review' },
      '/tmp'
    );
    assert.equal(result.ok, true);
    assert.equal(result.result.agent, 'security-engineer');
    assert.equal(result.result.fell_back, false);
  });

  it('returns ok: false with VALIDATION_ERROR when phase_deliverable is missing', async () => {
    const server = createServerForWorkspace();
    const result = await server.callTool(
      'get_agent_recommendation',
      {},
      '/tmp'
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 'VALIDATION_ERROR');
    assert.ok(typeof result.error === 'string' && result.error.length > 0);
  });
});
