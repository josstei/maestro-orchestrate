const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const { ROOT, withIsolatedClaudePlugin } = require('./helpers');

function waitForServerStartup(relativePath, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [relativePath], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      finish(
        new Error(
          `Timed out waiting for ${relativePath} to start.\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
        )
      );
    }, 5000);

    function finish(error) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (!child.killed) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 250).unref();
      }

      if (error) {
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();

      if (stderr.includes('[error] maestro: MCP server failed:')) {
        finish(new Error(stderr.trim()));
        return;
      }

      if (stderr.includes('[info] maestro: MCP server connected')) {
        finish();
      }
    });

    child.on('error', (error) => {
      finish(error);
    });

    child.on('exit', (code, signal) => {
      if (!settled) {
        finish(
          new Error(
            `${relativePath} exited before startup completed (code=${code}, signal=${signal}).\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
          )
        );
      }
    });
  });
}

describe('mcp server entrypoint startup', () => {
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

  it('starts the installed claude runtime server from an isolated plugin bundle', async () => {
    const result = await withIsolatedClaudePlugin((pluginRoot) =>
      waitForServerStartup('mcp/maestro-server.js', pluginRoot)
    );

    assert.match(result.stderr, /\[info\] maestro: MCP server starting/);
    assert.match(result.stderr, /\[info\] maestro: MCP server connected/);
  });

  it('starts the codex runtime server via the maestro-mcp-server bin', async () => {
    const result = await waitForServerStartup('bin/maestro-mcp-server.js');

    assert.match(result.stderr, /\[info\] maestro: MCP server starting/);
    assert.match(result.stderr, /\[info\] maestro: MCP server connected/);
  });
});
