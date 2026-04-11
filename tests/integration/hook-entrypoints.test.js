const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');

const { ROOT, withIsolatedClaudePlugin } = require('./helpers');

function runHook(relativePath, payload, cwd = ROOT) {
  return spawnSync('node', [relativePath], {
    cwd,
    input: `${JSON.stringify(payload)}\n`,
    encoding: 'utf8',
  });
}

function runHookAsync(relativePath, options = {}) {
  const cwd = options.cwd || ROOT;
  const input = options.input;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [relativePath], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      finish(new Error(`Timed out waiting for ${relativePath} to exit.\nSTDERR:\n${stderr}`));
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
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      finish(error);
    });

    child.on('exit', (code, signal) => {
      finish(null, { code, signal, stdout, stderr });
    });

    child.stdin.end(input);
  });
}

describe('generated hook entrypoints', () => {
  it('boots gemini hook adapters against canonical src hook logic', () => {
    const payload = {
      cwd: ROOT,
      session_id: 'hook-test-session',
    };

    const hookFiles = [
      'hooks/session-start.js',
      'hooks/before-agent.js',
      'hooks/after-agent.js',
      'hooks/session-end.js',
    ];

    for (const relativePath of hookFiles) {
      const result = runHook(relativePath, payload);

      assert.equal(result.status, 0, `${relativePath} exited non-zero: ${result.stderr}`);
      assert.doesNotThrow(() => JSON.parse(result.stdout), `Expected JSON output from ${relativePath}`);
    }
  });

  it('boots claude hook adapters against canonical src hook logic', () => {
    const payload = {
      cwd: ROOT,
      session_id: 'hook-test-session',
    };

    const hookFiles = [
      'claude/scripts/session-start.js',
      'claude/scripts/before-agent.js',
      'claude/scripts/session-end.js',
    ];

    for (const relativePath of hookFiles) {
      const result = runHook(relativePath, payload);

      assert.equal(result.status, 0, `${relativePath} exited non-zero: ${result.stderr}`);
      assert.doesNotThrow(() => JSON.parse(result.stdout), `Expected JSON output from ${relativePath}`);
    }
  });

  it('boots installed claude hook adapters from an isolated plugin bundle', async () => {
    await withIsolatedClaudePlugin(async (pluginRoot) => {
      const payload = {
        cwd: pluginRoot,
        session_id: 'hook-test-session',
      };

      const hookFiles = [
        'scripts/session-start.js',
        'scripts/before-agent.js',
        'scripts/session-end.js',
      ];

      for (const relativePath of hookFiles) {
        const result = runHook(relativePath, payload, pluginRoot);

        assert.equal(result.status, 0, `${relativePath} exited non-zero: ${result.stderr}`);
        assert.doesNotThrow(() => JSON.parse(result.stdout), `Expected JSON output from ${relativePath}`);
      }
    });
  });

  it('exits gemini hook adapters cleanly in async pipe mode after stdin closes', async () => {
    const payload = {
      cwd: ROOT,
      session_id: 'hook-async-session',
    };

    const hookFiles = [
      'hooks/session-start.js',
      'hooks/before-agent.js',
      'hooks/after-agent.js',
      'hooks/session-end.js',
    ];

    for (const relativePath of hookFiles) {
      const result = await runHookAsync(relativePath, {
        input: `${JSON.stringify(payload)}\n`,
      });

      assert.equal(result.signal, null, `${relativePath} exited with signal: ${result.signal}`);
      assert.equal(result.code, 0, `${relativePath} exited non-zero: ${result.stderr}`);
      assert.doesNotThrow(() => JSON.parse(result.stdout), `Expected JSON output from ${relativePath}`);
    }
  });

  it('exits claude hook adapters cleanly in async pipe mode after stdin closes', async () => {
    const payload = {
      cwd: ROOT,
      session_id: 'hook-async-session',
    };

    const hookFiles = [
      'claude/scripts/session-start.js',
      'claude/scripts/before-agent.js',
      'claude/scripts/session-end.js',
    ];

    for (const relativePath of hookFiles) {
      const result = await runHookAsync(relativePath, {
        input: `${JSON.stringify(payload)}\n`,
      });

      assert.equal(result.signal, null, `${relativePath} exited with signal: ${result.signal}`);
      assert.equal(result.code, 0, `${relativePath} exited non-zero: ${result.stderr}`);
      assert.doesNotThrow(() => JSON.parse(result.stdout), `Expected JSON output from ${relativePath}`);
    }
  });

  it('returns Gemini fallback output when validation closes hook stdin without JSON', async () => {
    const result = await runHookAsync('hooks/session-start.js');

    assert.equal(result.signal, null);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { continue: true });
    assert.match(result.stderr, /Hook error: Invalid JSON on stdin:/);
  });

  it('returns Claude fallback output when validation closes hook stdin without JSON', async () => {
    const result = await runHookAsync('claude/scripts/session-start.js');

    assert.equal(result.signal, null);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { continue: true, decision: 'approve' });
    assert.match(result.stderr, /Hook error: Invalid JSON on stdin:/);
  });
});
