const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const { ROOT, withIsolatedClaudePlugin } = require('./helpers');

function runHook(relativePath, payload, cwd = ROOT) {
  return spawnSync('node', [relativePath], {
    cwd,
    input: `${JSON.stringify(payload)}\n`,
    encoding: 'utf8',
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
});
