const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const { ROOT, withIsolatedClaudePlugin } = require('./helpers');

function runHook(relativePath, runtime, hookName, payload, cwd = ROOT) {
  return spawnSync('node', [relativePath, runtime, hookName], {
    cwd,
    input: `${JSON.stringify(payload)}\n`,
    encoding: 'utf8',
  });
}

describe('hook entrypoints', () => {
  it('boots gemini hook adapters against canonical src hook logic', () => {
    const payload = {
      cwd: ROOT,
      session_id: 'hook-test-session',
    };

    const hookNames = [
      'session-start',
      'before-agent',
      'after-agent',
      'session-end',
    ];

    for (const hookName of hookNames) {
      const result = runHook('hooks/hook-runner.js', 'gemini', hookName, payload);

      assert.equal(result.status, 0, `${hookName} exited non-zero: ${result.stderr}`);
      assert.doesNotThrow(() => JSON.parse(result.stdout), `Expected JSON output from ${hookName}`);
    }
  });

  it('boots claude hook adapters against canonical src hook logic', () => {
    const payload = {
      cwd: ROOT,
      session_id: 'hook-test-session',
    };

    const hookNames = [
      'session-start',
      'before-agent',
      'session-end',
    ];

    for (const hookName of hookNames) {
      const result = runHook('claude/scripts/hook-runner.js', 'claude', hookName, payload);

      assert.equal(result.status, 0, `${hookName} exited non-zero: ${result.stderr}`);
      assert.doesNotThrow(() => JSON.parse(result.stdout), `Expected JSON output from ${hookName}`);
    }
  });

  it('boots installed claude hook adapters from an isolated plugin bundle', async () => {
    await withIsolatedClaudePlugin(async (pluginRoot) => {
      const payload = {
        cwd: pluginRoot,
        session_id: 'hook-test-session',
      };

      const hookNames = [
        'session-start',
        'before-agent',
        'session-end',
      ];

      for (const hookName of hookNames) {
        const result = runHook('scripts/hook-runner.js', 'claude', hookName, payload, pluginRoot);

        assert.equal(result.status, 0, `${hookName} exited non-zero: ${result.stderr}`);
        assert.doesNotThrow(() => JSON.parse(result.stdout), `Expected JSON output from ${hookName}`);
      }
    });
  });
});
