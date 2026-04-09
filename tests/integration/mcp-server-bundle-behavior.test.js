const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ROOT, withIsolatedCodexPlugin } = require('./helpers');
const { spawnMcpServer } = require('./mcp-stdio-client');

async function withServer(options, fn) {
  const client = spawnMcpServer(options);
  try {
    await client.ready;
    await client.initialize();
    return await fn(client);
  } finally {
    await client.close();
  }
}

describe('mcp server bundle behavior', () => {
  it('serves updated get_skill_content metadata from every runtime bundle', async () => {
    const staticRuntimes = [
      { cwd: ROOT, relativePath: 'mcp/maestro-server.js' },
      { cwd: ROOT, relativePath: 'claude/mcp/maestro-server.js' },
    ];

    for (const runtime of staticRuntimes) {
      await withServer(runtime, async (client) => {
        const tools = await client.listTools();
        const skillTool = tools.find((tool) => tool.name === 'get_skill_content');

        assert.ok(skillTool, `Expected get_skill_content for ${runtime.relativePath}`);
        assert.match(
          skillTool.description,
          /runtime-configured Maestro content source/
        );
      });
    }

    await withIsolatedCodexPlugin(async (pluginRoot) => {
      await withServer({ cwd: pluginRoot, relativePath: 'mcp/maestro-server.js' }, async (client) => {
        const tools = await client.listTools();
        const skillTool = tools.find((tool) => tool.name === 'get_skill_content');

        assert.ok(skillTool, 'Expected get_skill_content for isolated codex bundle');
        assert.match(
          skillTool.description,
          /runtime-configured Maestro content source/
        );
      });
    });
  });

  it('serves canonical src content from every runtime bundle', async () => {
    const staticRuntimes = [
      {
        cwd: ROOT,
        relativePath: 'mcp/maestro-server.js',
        expectSkill: '# Delegation Skill',
      },
      {
        cwd: ROOT,
        relativePath: 'claude/mcp/maestro-server.js',
        expectSkill: 'user-invocable: false',
      },
    ];

    for (const runtime of staticRuntimes) {
      await withServer(runtime, async (client) => {
        const skillResult = await client.callTool('get_skill_content', {
          resources: ['delegation', 'architecture'],
        });
        const agentResult = await client.callTool('get_agent', {
          agents: ['coder'],
        });

        assert.ok(skillResult.parsed.contents.delegation.includes(runtime.expectSkill));
        assert.ok(skillResult.parsed.contents.architecture.includes('## State Contract'));
        assert.deepEqual(skillResult.parsed.errors, {});
        assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
        assert.deepEqual(agentResult.parsed.errors, {});
      });
    }

    await withIsolatedCodexPlugin(async (pluginRoot) => {
      await withServer(
        {
          cwd: pluginRoot,
          relativePath: 'mcp/maestro-server.js',
        },
        async (client) => {
          const skillResult = await client.callTool('get_skill_content', {
            resources: ['delegation', 'architecture'],
          });
          const agentResult = await client.callTool('get_agent', {
            agents: ['coder'],
          });

          assert.ok(skillResult.parsed.contents.delegation.includes('# Delegation Skill'));
          assert.ok(skillResult.parsed.contents.architecture.includes('## State Contract'));
          assert.deepEqual(skillResult.parsed.errors, {});
          assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
          assert.deepEqual(agentResult.parsed.errors, {});
        }
      );
    });
  });
});
