'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { expectExit, runNode } = require('../support/process');
const { MCP_ENTRYPOINTS, withEntrypointCwd } = require('./mcp-entrypoints');
const { withMcpClient } = require('./mcp-stdio-client');

function assertServerStarts(options) {
  return withMcpClient(options, (client) => {
    assert.match(client.stderr, /\[info\] maestro: MCP server starting/);
    assert.match(client.stderr, /\[info\] maestro: MCP server connected/);
  }, { initialize: false });
}

describe('mcp server entrypoint startup', () => {
  for (const entry of MCP_ENTRYPOINTS) {
    it(entry.title, () =>
      withEntrypointCwd(entry, (cwd) => assertServerStarts({ cwd, relativePath: entry.relativePath }))
    );
  }

  it('refuses to start for the removed gemini runtime', () => {
    const result = runNode('mcp/maestro-server.js', [], {
      env: { ...process.env, MAESTRO_RUNTIME: 'gemini' },
      input: '',
    });

    expectExit(result, { status: 1, stdout: '' });
    assert.match(result.stderr, /Error: Unknown runtime config: gemini/);
  });
});
