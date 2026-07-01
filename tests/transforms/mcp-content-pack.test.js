const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { getRuntimeConfig } = require('../../src/mcp/runtime/runtime-config-map');
const {
  buildMcpServer,
  createContentPack,
  makeTempWorkspace,
} = require('../support/mcp');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function withExtensionRoot(root, fn) {
  const previous = process.env.MAESTRO_EXTENSION_PATH;
  process.env.MAESTRO_EXTENSION_PATH = root;

  try {
    return fn();
  } finally {
    if (previous == null) {
      delete process.env.MAESTRO_EXTENSION_PATH;
    } else {
      process.env.MAESTRO_EXTENSION_PATH = previous;
    }
  }
}

describe('content tool pack', () => {
  it('registers the content and runtime metadata tools', () => {
    const server = buildMcpServer({
      runtimeConfig: getRuntimeConfig('claude'),
      services: {
        canonicalSrcRoot: path.join(REPO_ROOT, 'src'),
      },
      toolPacks: [createContentPack],
    });

    assert.deepEqual(
      server.getToolSchemas().map((schema) => schema.name),
      ['get_skill_content', 'get_agent', 'get_runtime_context']
    );
  });

  it('serves skill content, agent content, and runtime context through the pack', async () => {
    const root = makeTempWorkspace('maestro-content-pack-');
    fs.mkdirSync(path.join(root, 'src', 'skills', 'shared', 'delegation'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(root, 'src', 'agents'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'src', 'skills', 'shared', 'delegation', 'SKILL.md'),
      '---\nname: delegation\ndescription: Demo skill\n---\nUse ${extensionPath} here.\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(root, 'src', 'agents', 'coder.md'),
      [
        '---',
        'name: coder',
        'tools: [read_file, write_file]',
        '---',
        'Methodology body.',
      ].join('\n'),
      'utf8'
    );

    const server = buildMcpServer({
      runtimeConfig: getRuntimeConfig('claude'),
      services: {
        canonicalSrcRoot: path.join(root, 'src'),
      },
      toolPacks: [createContentPack],
    });

    const skillResult = await withExtensionRoot(root, () =>
      server.callTool('get_skill_content', { resources: ['delegation'] })
    );
    const agentResult = await withExtensionRoot(root, () =>
      server.callTool('get_agent', { agents: ['coder'] })
    );
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
