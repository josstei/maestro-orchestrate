const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

function waitForServerStartup(relativePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [relativePath], {
      cwd: ROOT,
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

  it('starts the codex runtime server without external SDK installation', async () => {
    const result = await waitForServerStartup('plugins/maestro/mcp/maestro-server.js');

    assert.match(result.stderr, /\[info\] maestro: MCP server starting/);
    assert.match(result.stderr, /\[info\] maestro: MCP server connected/);
  });
});
