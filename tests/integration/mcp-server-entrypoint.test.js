import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, withPackagedClaudeRuntime } from './helpers.js';
import { makeTempDir, writeFixtureFile } from '../support/filesystem.js';
import { spawnMcpServer, withMcpServer } from './mcp-stdio-client.js';

function waitForServerStartup(relativePath, cwd = ROOT) {
  return withMcpServer(
    { cwd, relativePath },
    (client) => ({ stderr: client.getStderr() }),
    { initialize: false }
  );
}

describe('mcp server entrypoint startup', () => {
  it('escalates to SIGKILL when a child ignores SIGTERM', async (t) => {
    const root = makeTempDir(t, 'maestro-stubborn-mcp-');
    const entrypoint = writeFixtureFile(
      root,
      'stubborn-server.cjs',
      `process.on('SIGTERM', () => {});
console.error('[info] maestro: MCP server connected');
setInterval(() => {}, 1000);
`,
    );
    const client = spawnMcpServer({ cwd: root, relativePath: entrypoint });
    t.after(() => client.close());

    await client.ready;
    await client.close();

    assert.equal(client.child.signalCode, 'SIGKILL');
  });

  it('starts the gemini runtime server without external SDK installation', async () => {
    const result = await waitForServerStartup('mcp/maestro-server.js');

    assert.match(result.stderr, /\[info\] maestro: MCP server starting/);
    assert.match(result.stderr, /\[info\] maestro: MCP server connected/);
  });

  it('starts the claude runtime server without external SDK installation', async () => {
    const result = await waitForServerStartup('claude/mcp/maestro-server.js');

    assert.match(result.stderr, /\[info\] maestro: MCP server starting/);
    assert.match(result.stderr, /\[info\] maestro: MCP server connected/);
  });

  it('starts the installed claude runtime server from a package-root runtime bundle', async () => {
    const result = await withPackagedClaudeRuntime((packageRoot) =>
      waitForServerStartup('claude/mcp/maestro-server.js', packageRoot)
    );

    assert.match(result.stderr, /\[info\] maestro: MCP server starting/);
    assert.match(result.stderr, /\[info\] maestro: MCP server connected/);
  });

  it('starts the codex runtime server via the compiled maestro-mcp-server bin', async () => {
    const result = await waitForServerStartup('dist/src/bin/maestro-mcp-server.js');

    assert.match(result.stderr, /\[info\] maestro: MCP server starting/);
    assert.match(result.stderr, /\[info\] maestro: MCP server connected/);
  });
});
