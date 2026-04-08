const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ROOT } = require('./helpers');
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
    const runtimes = [
      { cwd: ROOT, relativePath: 'mcp/maestro-server.js' },
      { cwd: ROOT, relativePath: 'claude/mcp/maestro-server.js' },
      { cwd: path.join(ROOT, 'plugins', 'maestro'), relativePath: 'mcp/maestro-server.js' },
    ];

    for (const runtime of runtimes) {
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
  });

  it('serves filesystem-backed shared content from the gemini runtime bundle', async () => {
    await withServer({ cwd: ROOT, relativePath: 'mcp/maestro-server.js' }, async (client) => {
      const result = await client.callTool('get_skill_content', {
        resources: ['delegation'],
      });

      assert.ok(result.parsed.contents.delegation.includes('# Delegation Skill'));
      assert.deepEqual(result.parsed.errors, {});
    });
  });

  it('serves filesystem-backed shared content from the claude runtime bundle', async () => {
    await withServer({ cwd: ROOT, relativePath: 'claude/mcp/maestro-server.js' }, async (client) => {
      const result = await client.callTool('get_skill_content', {
        resources: ['delegation'],
      });

      assert.ok(result.parsed.contents.delegation.includes('# Delegation Skill'));
      assert.ok(result.parsed.contents.delegation.includes('user-invocable: false'));
      assert.deepEqual(result.parsed.errors, {});
    });
  });

  it('serves bundled content from an isolated codex runtime bundle without a src tree', async () => {
    const pluginRoot = path.join(ROOT, 'plugins', 'maestro');
    const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-codex-mcp-'));

    fs.cpSync(pluginRoot, isolatedRoot, { recursive: true });

    assert.equal(fs.existsSync(path.join(isolatedRoot, 'src')), false);

    await withServer({ cwd: isolatedRoot, relativePath: 'mcp/maestro-server.js' }, async (client) => {
      const skillResult = await client.callTool('get_skill_content', {
        resources: ['delegation', 'architecture'],
      });
      const agentResult = await client.callTool('get_agent', {
        agents: ['coder'],
      });

      assert.ok(skillResult.parsed.contents.delegation.includes('# Delegation Skill'));
      assert.ok(skillResult.parsed.contents.architecture.includes('workspace root'));
      assert.deepEqual(skillResult.parsed.errors, {});
      assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
      assert.deepEqual(agentResult.parsed.errors, {});
    });
  });
});
