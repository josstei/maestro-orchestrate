import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertDistBuilt, ROOT } from '../support/dist.js';
import { spawnMcpServer } from './mcp-stdio-client.js';

async function withDistServer(fn) {
  const client = spawnMcpServer({
    cwd: ROOT,
    relativePath: 'dist/src/bin/maestro-mcp-server.js',
    env: { MAESTRO_EXTENSION_PATH: '', MAESTRO_RUNTIME: 'codex' },
  });

  try {
    await client.ready;
    await client.initialize();
    return await fn(client);
  } finally {
    await client.close();
  }
}

describe('dist runtime startup', () => {
  it('runs the compiled Codex installer bin from dist', () => {
    assertDistBuilt(['src/bin/maestro-install-codex.js']);
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-dist-bin-home-'));

    try {
      const output = execFileSync(process.execPath, ['dist/src/bin/maestro-install-codex.js', '--dry-run'], {
        cwd: ROOT,
        env: { ...process.env, HOME: homeDir },
        encoding: 'utf8',
      });

      assert.match(output, /Dry run complete\./);
      assert.match(output, /Plugin source:/);
      assert.equal(fs.existsSync(path.join(homeDir, '.codex', 'plugins', 'maestro')), false);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('starts the compiled MCP server bin and serves runtime content from dist', async () => {
    assertDistBuilt(['src/bin/maestro-mcp-server.js', 'src/mcp/maestro-server.js']);

    await withDistServer(async (client) => {
      const runtimeResult = await client.callTool('get_runtime_context');
      const skillResult = await client.callTool('get_skill_content', {
        resources: ['delegation'],
      });
      const agentResult = await client.callTool('get_agent', {
        agents: ['coder'],
      });

      assert.equal(runtimeResult.parsed.runtime, 'codex');
      assert.ok(skillResult.parsed.contents.delegation.includes('# Delegation Skill'));
      assert.deepEqual(skillResult.parsed.errors, {});
      assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
      assert.deepEqual(agentResult.parsed.errors, {});
    });
  });
});
