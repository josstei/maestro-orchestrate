'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { withIsolatedClaudePlugin } = require('./helpers');
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
    title: 'starts the gemini runtime server without external SDK installation',
    relativePath: 'mcp/maestro-server.js',
  },
  {
    title: 'starts the claude runtime server without external SDK installation',
    relativePath: 'claude/mcp/maestro-server.js',
  },
  {
    title: 'starts the installed claude runtime server from an isolated plugin bundle',
    relativePath: 'mcp/maestro-server.js',
    isolatedClaudePlugin: true,
  },
  {
    title: 'starts the codex runtime server via the maestro-mcp-server bin',
    relativePath: 'bin/maestro-mcp-server.js',
  },
];

describe('mcp server entrypoint startup', () => {
  for (const { title, relativePath, isolatedClaudePlugin } of ENTRYPOINTS) {
    it(title, () =>
      isolatedClaudePlugin
        ? withIsolatedClaudePlugin((pluginRoot) =>
            assertServerStarts({ cwd: pluginRoot, relativePath })
          )
        : assertServerStarts({ relativePath })
    );
  }
});
