'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const { ROOT, withIsolatedClaudePlugin } = require('./helpers');

function runHook(relativePath, runtime, hookName, input, cwd = ROOT) {
  return spawnSync(process.execPath, [relativePath, runtime, hookName], {
    cwd,
    input: typeof input === 'string' ? input : `${JSON.stringify(input)}\n`,
    encoding: 'utf8',
  });
}

function assertHooksBoot({ runner, runtime, hooks, cwd = ROOT }) {
  const payload = {
    cwd,
    session_id: 'hook-test-session',
  };

  for (const hookName of hooks) {
    const result = runHook(runner, runtime, hookName, payload, cwd);

    assert.equal(result.status, 0, `${hookName} exited non-zero: ${result.stderr}`);
    assert.doesNotThrow(() => JSON.parse(result.stdout), `Expected JSON output from ${hookName}`);
  }
}

const CLAUDE_HOOKS = ['session-start', 'before-agent', 'session-end'];

const BOOT_CASES = [
  {
    label: 'gemini',
    runner: 'hooks/hook-runner.js',
    runtime: 'gemini',
    hooks: ['session-start', 'before-agent', 'after-agent', 'session-end'],
  },
  {
    label: 'claude',
    runner: 'claude/scripts/hook-runner.js',
    runtime: 'claude',
    hooks: CLAUDE_HOOKS,
  },
];

describe('hook entrypoints', () => {
  for (const bootCase of BOOT_CASES) {
    it(`boots ${bootCase.label} hook adapters against canonical src hook logic`, () => {
      assertHooksBoot(bootCase);
    });
  }

  it('boots installed claude hook adapters from an isolated plugin bundle', async () => {
    await withIsolatedClaudePlugin(async (pluginRoot) => {
      assertHooksBoot({
        runner: 'scripts/hook-runner.js',
        runtime: 'claude',
        hooks: CLAUDE_HOOKS,
        cwd: pluginRoot,
      });
    });
  });

  it('installed claude hook fallback blocks on invalid stdin', async () => {
    await withIsolatedClaudePlugin(async (pluginRoot) => {
      const result = runHook(
        'scripts/hook-runner.js',
        'claude',
        'session-start',
        'not-json',
        pluginRoot
      );

      assert.equal(result.status, 0, `Expected exit 0 for claude fallback, got ${result.status}`);
      assert.deepEqual(JSON.parse(result.stdout), {
        continue: false,
        decision: 'block',
      });
    });
  });

  it('rejects a runtime without a hook adapter in the repo install', () => {
    const result = runHook('hooks/hook-runner.js', 'codex', 'session-start', {});

    assert.equal(result.status, 1);
    assert.equal(result.stderr, 'Unknown runtime: codex\n');
    assert.equal(result.stdout, '');
  });

  it('rejects other runtimes from an isolated claude plugin bundle', async () => {
    await withIsolatedClaudePlugin(async (pluginRoot) => {
      const result = runHook('scripts/hook-runner.js', 'gemini', 'session-start', {}, pluginRoot);

      assert.equal(result.status, 1);
      assert.equal(result.stderr, 'Unknown runtime: gemini\n');
      assert.equal(result.stdout, '');
    });
  });

  it('rejects bad invocations, checking the runtime before the hook name', () => {
    const usage = 'Usage: node hook-runner.js <runtime> <hook-name>\n';
    const cases = [
      [[], usage],
      [['gemini'], usage],
      [['gemini', 'nope'], 'Unknown hook: nope\n'],
      [['bogus', 'nope'], 'Unknown runtime: bogus\n'],
    ];

    for (const [args, stderr] of cases) {
      const result = spawnSync(process.execPath, ['hooks/hook-runner.js', ...args], {
        cwd: ROOT,
        input: '{}\n',
        encoding: 'utf8',
      });

      assert.equal(result.status, 1, `exit code for [${args.join(' ')}]`);
      assert.equal(result.stderr, stderr);
      assert.equal(result.stdout, '');
    }
  });

  it('answers with the adapter error fallback when stdin is not JSON', () => {
    const result = runHook('hooks/hook-runner.js', 'gemini', 'session-start', 'not-json');

    assert.equal(result.status, 0);
    assert.match(result.stderr, /^Hook error: /);
    assert.deepEqual(JSON.parse(result.stdout), { continue: false });
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
