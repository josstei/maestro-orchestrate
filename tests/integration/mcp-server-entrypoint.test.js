'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const { ROOT, withIsolatedAntigravityPlugin, withIsolatedClaudePlugin } = require('./helpers');
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

const ENTRYPOINTS = [
  {
    title: 'starts the server from the repo-root (Qwen) entrypoint without external SDK installation',
    relativePath: 'mcp/maestro-server.js',
  },
  {
    title: 'starts the server from the Claude plugin shim without external SDK installation',
    relativePath: 'claude/mcp/maestro-server.js',
  },
  {
    title: 'starts the server from an isolated installed Claude plugin bundle',
    relativePath: 'mcp/maestro-server.js',
    isolatedPlugin: withIsolatedClaudePlugin,
  },
  {
    title: 'starts the server via the Codex maestro-mcp-server bin',
    relativePath: 'bin/maestro-mcp-server.js',
  },
  {
    title: 'starts the server from the Antigravity repo plugin shim',
    relativePath: 'antigravity/mcp/maestro-server.js',
  },
  {
    title: 'starts the server from an isolated installed Antigravity plugin',
    relativePath: 'mcp/maestro-server.js',
    isolatedPlugin: withIsolatedAntigravityPlugin,
  },
];

describe('mcp server entrypoint startup', () => {
  for (const { title, relativePath, isolatedPlugin } of ENTRYPOINTS) {
    it(title, () =>
      isolatedPlugin
        ? isolatedPlugin((pluginRoot) => assertServerStarts({ cwd: pluginRoot, relativePath }))
        : assertServerStarts({ relativePath })
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
