'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const { ROOT } = require('./helpers');
const { MCP_ENTRYPOINTS, withEntrypointCwd } = require('./mcp-entrypoints');
const { spawnMcpServer } = require('./mcp-stdio-client');

async function assertServerStarts(options) {
  const client = spawnMcpServer(options);
  try {
    await client.ready;
    assert.match(client.stderr, /\[info\] maestro: MCP server starting/);
    assert.match(client.stderr, /\[info\] maestro: MCP server connected/);
  } finally {
    await client.close();
  }
}

describe('mcp server entrypoint startup', () => {
  for (const entry of MCP_ENTRYPOINTS) {
    it(entry.title, () =>
      withEntrypointCwd(entry, (cwd) => assertServerStarts({ cwd, relativePath: entry.relativePath }))
    );
  }

  it('refuses to start for the removed gemini runtime', () => {
    const result = spawnSync(process.execPath, ['mcp/maestro-server.js'], {
      cwd: ROOT,
      env: { ...process.env, MAESTRO_RUNTIME: 'gemini' },
      input: '',
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Error: Unknown runtime config: gemini/);
    assert.equal(result.stdout, '');
  });
});
