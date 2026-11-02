'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createServer } = require('../../src/mcp/core/create-server');
const { createToolPack } = require('../../src/mcp/tool-packs/content');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { writeAgentFixture } = require('../support/agent-fixtures');
const { makeTempDir, writeTree } = require('../support/fs');

describe('content tool pack', () => {
  it('serves skill content, agent content, and runtime context through the pack', async () => {
    const root = makeTempDir('maestro-content-pack-');
    writeTree(
      root,
      'src/skills/shared/delegation/SKILL.md',
      '---\nname: delegation\ndescription: Demo skill\n---\nUse ${extensionPath} here.\n'
    );
    writeAgentFixture(
      path.join(root, 'src'),
      'coder',
      [
        '---',
        'name: coder',
        'tools: [read_file, write_file]',
        '---',
        'Methodology body.',
      ].join('\n')
    );

    const server = createServer({
      runtimeConfig: getRuntimeConfig('claude'),
      services: {
        canonicalSrcRoot: path.join(root, 'src'),
      },
      toolPacks: [createToolPack],
    });

    const skillResult = await server.callTool('get_skill_content', { resources: ['delegation'] });
    const agentResult = await server.callTool('get_agent', { agents: ['coder'] });
    const contextResult = await server.callTool('get_runtime_context');

    assert.equal(skillResult.ok, true);
    assert.ok(
      skillResult.result.contents.delegation.includes('${CLAUDE_PLUGIN_ROOT}')
    );
    assert.equal(agentResult.ok, true);
    assert.deepEqual(agentResult.result.agents.coder.tools, ['Read', 'Write']);
    assert.equal(contextResult.ok, true);
    assert.equal(
      contextResult.result.mcp_prefix,
      'mcp__plugin_maestro_maestro__'
    );
  });
});
