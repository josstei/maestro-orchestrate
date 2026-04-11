const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const { ROOT, withIsolatedClaudePlugin, withIsolatedCodexPlugin } = require('./helpers');

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

function waitForInitializeRoundTripThenExit(relativePath, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [relativePath], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stdoutBuffer = '';
    let stderr = '';
    let settled = false;
    let sawInitializeResult = false;
    let sentInitialize = false;

    const timeout = setTimeout(() => {
      finish(
        new Error(
          `Timed out waiting for ${relativePath} to exit after initialize.\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
        )
      );
    }, 5000);

    function finish(error, result) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (!child.killed && child.exitCode == null) {
        child.kill('SIGKILL');
      }

      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;

      while (true) {
        const newlineIndex = stdoutBuffer.indexOf('\n');
        if (newlineIndex === -1) {
          break;
        }

        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

        if (!line) {
          continue;
        }

        let message;
        try {
          message = JSON.parse(line);
        } catch (error) {
          finish(new Error(`Failed to parse server output: ${error.message}\n${line}`));
          return;
        }

        if (message.id === 1 && message.result) {
          sawInitializeResult = true;
          child.stdin.write(
            JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n'
          );
          child.stdin.end();
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();

      if (!sentInitialize && stderr.includes('[info] maestro: MCP server connected')) {
        sentInitialize = true;
        child.stdin.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-03-26',
              capabilities: {},
              clientInfo: {
                name: 'maestro-test',
                version: '0.0.0',
              },
            },
          }) + '\n'
        );
      }
    });

    child.on('error', (error) => {
      finish(error);
    });

    child.on('exit', (code, signal) => {
      if (!sawInitializeResult) {
        finish(
          new Error(
            `${relativePath} exited before initialize completed (code=${code}, signal=${signal}).\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
          )
        );
        return;
      }

      finish(null, { code, signal, stdout, stderr });
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

  it('starts the codex runtime server without external SDK installation', async () => {
    const result = await withIsolatedCodexPlugin((pluginRoot) =>
      waitForServerStartup('mcp/maestro-server.js', pluginRoot)
    );

    assert.match(result.stderr, /\[info\] maestro: MCP server starting/);
    assert.match(result.stderr, /\[info\] maestro: MCP server connected/);
  });

  it('exits naturally after an initialize round-trip when stdin closes', async () => {
    const result = await waitForInitializeRoundTripThenExit('mcp/maestro-server.js');

    assert.equal(result.signal, null);
    assert.equal(result.code, 0);
    assert.match(result.stderr, /\[info\] maestro: MCP server connected/);
  });
});
