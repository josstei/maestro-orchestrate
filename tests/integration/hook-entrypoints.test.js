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

  it('boots qwen hook adapters against canonical src hook logic', () => {
    const cases = [
      ['session-start', { cwd: ROOT, session_id: 'hook-test-session', hook_event_name: 'SessionStart' }],
      ['before-agent', { cwd: ROOT, session_id: 'hook-test-session', hook_event_name: 'SubagentStart', agent_type: 'coder' }],
      ['after-agent', {
        cwd: ROOT,
        session_id: 'hook-test-session',
        hook_event_name: 'SubagentStop',
        agent_type: 'coder',
        last_assistant_message: '## Task Report\nDone.\n\n## Downstream Context\nNext steps.',
      }],
      ['session-end', { cwd: ROOT, session_id: 'hook-test-session', hook_event_name: 'SessionEnd' }],
    ];

    for (const [hookName, payload] of cases) {
      const result = runHook('hooks/hook-runner.js', 'qwen', hookName, payload);

      assert.equal(result.status, 0, `${hookName} exited non-zero: ${result.stderr}`);
      assert.doesNotThrow(() => JSON.parse(result.stdout), `Expected JSON output from ${hookName}`);
    }
  });

  it('exits with code 2 when a qwen hook denies execution', () => {
    const start = runHook('hooks/hook-runner.js', 'qwen', 'before-agent', {
      cwd: ROOT,
      session_id: 'hook-test-session',
      hook_event_name: 'SubagentStart',
      agent_type: 'coder',
    });
    assert.equal(start.status, 0, `before-agent exited non-zero: ${start.stderr}`);

    const result = runHook('hooks/hook-runner.js', 'qwen', 'after-agent', {
      cwd: ROOT,
      session_id: 'hook-test-session',
      hook_event_name: 'SubagentStop',
      agent_type: 'coder',
      last_assistant_message: 'Missing required sections',
    });

    assert.equal(result.status, 2, `Expected deny exit code 2, got ${result.status}: ${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout), {
      continue: false,
      decision: 'block',
      reason: 'Handoff report validation failed: Missing Task Report section (expected ## Task Report heading); Missing Downstream Context section (expected ## Downstream Context heading). Please include both a ## Task Report section and a ## Downstream Context section in your response.',
    });
  });

  it('gemini hooks always exit 0 even on deny (JSON carries decision)', () => {
    const result = runHook('hooks/hook-runner.js', 'gemini', 'before-agent', {
      cwd: ROOT,
      session_id: 'hook-test-session',
      hook_event_name: 'BeforeAgent',
      prompt: 'agent: coder\n\nImplement the feature.',
    });
    assert.equal(result.status, 0, `before-agent exited non-zero: ${result.stderr}`);

    const denyResult = runHook('hooks/hook-runner.js', 'gemini', 'after-agent', {
      cwd: ROOT,
      session_id: 'hook-test-session',
      hook_event_name: 'AfterAgent',
      prompt_response: 'Missing required sections',
    });
    assert.equal(denyResult.status, 0, `Expected exit 0 for gemini deny, got ${denyResult.status}`);
    const parsed = JSON.parse(denyResult.stdout);
    assert.equal(parsed.continue, false);
  });
});
