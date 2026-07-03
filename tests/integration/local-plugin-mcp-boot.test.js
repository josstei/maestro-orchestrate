'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ROOT } = require('./helpers');
const { spawnMcpServer } = require('./mcp-stdio-client');
const { assembleClaudePlugin } = require('../../scripts/assemble-claude-plugin');

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

describe('assembled local claude plugin MCP boot (integration)', () => {
  it('boots the promoted server and serves canonical content from the bundled src', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-local-boot-'));
    try {
      const { pluginDir } = assembleClaudePlugin({ root: ROOT, outDir });

      await withServer(
        {
          cwd: pluginDir,
          relativePath: path.join('mcp', 'maestro-server.js'),
          env: { MAESTRO_EXTENSION_PATH: '', CLAUDE_PLUGIN_ROOT: pluginDir },
        },
        async (client) => {
          const tools = await client.listTools();
          assert.ok(tools.find((tool) => tool.name === 'get_agent'), 'expected get_agent tool');
          assert.ok(tools.find((tool) => tool.name === 'get_skill_content'), 'expected get_skill_content tool');

          const agentResult = await client.callTool('get_agent', { agents: ['coder'] });
          assert.deepEqual(agentResult.parsed.errors, {});
          assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));

          const skillResult = await client.callTool('get_skill_content', { resources: ['delegation'] });
          assert.deepEqual(skillResult.parsed.errors, {});
          assert.ok(skillResult.parsed.contents.delegation.includes('Delegation Skill'));
        }
      );
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
