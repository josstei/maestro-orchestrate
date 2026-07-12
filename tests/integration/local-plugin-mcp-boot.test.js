import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './helpers.js';
import { withMcpServer as withServer } from './mcp-stdio-client.js';
import { assembleClaudePlugin } from '../../dist/src/tooling/assemble-claude-plugin.js';

describe('assembled local claude plugin MCP boot (integration)', () => {
  it('boots the promoted server and serves runtime content from bundled dist', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-local-boot-'));
    try {
      const { pluginDir } = assembleClaudePlugin({ root: ROOT, outDir });
      fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(outDir, 'node_modules'), 'dir');

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
