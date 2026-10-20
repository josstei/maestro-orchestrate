'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../../src/mcp/core/create-server');
const { createToolPack } = require('../../src/mcp/tool-packs/content');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');

function createContentPackServer() {
  return createServer({
    runtimeConfig: getRuntimeConfig('claude'),
    services: {},
    toolPacks: [createToolPack],
  });
}

describe('content tool pack', () => {
  it('registers the content and runtime metadata tools', () => {
    assert.deepEqual(
      createContentPackServer().getToolSchemas().map((schema) => schema.name),
      ['get_skill_content', 'get_agent', 'get_runtime_context']
    );
  });

  it('serves skill content, agent content, and runtime context for the runtime', async () => {
    const server = createContentPackServer();

    const skillResult = await server.callTool('get_skill_content', { resources: ['delegation'] });
    const agentResult = await server.callTool('get_agent', { agents: ['coder'] });
    const contextResult = await server.callTool('get_runtime_context');

    assert.equal(skillResult.ok, true);
    assert.ok(skillResult.result.contents.delegation.includes('user-invocable: false'));
    assert.equal(agentResult.ok, true);
    assert.equal(agentResult.result.agents.coder.tools[0], 'Read');
    assert.equal(contextResult.ok, true);
    assert.equal(contextResult.result.mcp_prefix, 'mcp__plugin_maestro_maestro__');
  });
});
