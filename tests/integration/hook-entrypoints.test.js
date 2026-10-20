'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const markdownState = require('../../src/core/markdown-state');
const { makeTempDir } = require('../support/fs');
const { ROOT, withIsolatedAntigravityPlugin, withIsolatedClaudePlugin } = require('./helpers');

// Hooks keep per-session state under MAESTRO_HOOKS_DIR; give them a private
// one instead of the shared default under os.tmpdir().
const HOOKS_DIR = makeTempDir('maestro-hooks-test-');

function runHook(relativePath, runtime, hookName, input, cwd = ROOT, env = {}) {
  return spawnSync(process.execPath, [relativePath, runtime, hookName], {
    cwd,
    env: { ...process.env, MAESTRO_HOOKS_DIR: HOOKS_DIR, ...env },
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
    label: 'claude',
    runner: 'claude/scripts/hook-runner.js',
    runtime: 'claude',
    hooks: CLAUDE_HOOKS,
  },
];

// Antigravity runs hooks from the plugin root and names the workspace in a
// camelCase payload, so session state is read from workspacePaths[0].
const ANTIGRAVITY_PLUGIN_ROOT = path.join(ROOT, 'antigravity');

function runAntigravityHook(pluginRoot, hookName, input) {
  return runHook('hooks/hook-runner.js', 'antigravity', hookName, input, pluginRoot, {
    // Keep temp workspaces from resolving to an enclosing checkout.
    GIT_CEILING_DIRECTORIES: fs.realpathSync(os.tmpdir()),
  });
}

// Each workspace gets its own conversation, named after its unique temp dir.
function antigravityPayload(workspace) {
  return {
    conversationId: path.basename(workspace),
    workspacePaths: [workspace],
    transcriptPath: path.join(workspace, 'transcript.jsonl'),
    artifactDirectoryPath: path.join(workspace, 'artifacts'),
    modelName: 'example-model',
  };
}

function makeWorkspace(prefix, session = null) {
  const workspace = makeTempDir(prefix);
  if (session) {
    const sessionFilePath = path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md');
    fs.mkdirSync(path.dirname(sessionFilePath), { recursive: true });
    fs.writeFileSync(sessionFilePath, markdownState.serialize(session, '# Session\n'), 'utf8');
  }
  return workspace;
}

function assertAntigravitySessionHooks(pluginRoot) {
  const idle = antigravityPayload(makeWorkspace('maestro-antigravity-idle-'));
  for (const hookName of ['session-start', 'before-agent']) {
    const result = runAntigravityHook(pluginRoot, hookName, idle);

    assert.equal(result.status, 0, `${hookName} exited non-zero: ${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout), {}, `${hookName} without an active session`);
  }

  const active = antigravityPayload(
    makeWorkspace('maestro-antigravity-active-', { session_id: 's1', status: 'in_progress', current_phase: 2 })
  );

  const start = runAntigravityHook(pluginRoot, 'session-start', active);
  assert.equal(start.status, 0, `session-start exited non-zero: ${start.stderr}`);
  assert.deepEqual(JSON.parse(start.stdout), {});

  const context = runAntigravityHook(pluginRoot, 'before-agent', active);
  assert.equal(context.status, 0, `before-agent exited non-zero: ${context.stderr}`);
  assert.deepEqual(JSON.parse(context.stdout), {
    injectSteps: [{ systemMessage: { systemMessage: 'Active session: current_phase=2, status=in_progress' } }],
  });
  // Antigravity has no session-end hook and its payload names no agent, so
  // neither hook may leave per-conversation hook state behind.
  assert.equal(fs.existsSync(path.join(HOOKS_DIR, active.conversationId)), false,
    'Antigravity hooks must not create per-conversation hook state');
}

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

  it('boots antigravity SessionStart hooks from the plugin root against canonical src hook logic', () => {
    assertAntigravitySessionHooks(ANTIGRAVITY_PLUGIN_ROOT);
  });

  it('boots installed antigravity hooks from an isolated plugin copy', async () => {
    await withIsolatedAntigravityPlugin(async (pluginRoot) => {
      assertAntigravitySessionHooks(pluginRoot);

      // The bundled src/ carries only the antigravity and shared platform dirs.
      const result = runHook('hooks/hook-runner.js', 'claude', 'session-start', {}, pluginRoot);
      assert.equal(result.status, 1);
      assert.equal(result.stderr, 'Unknown runtime: claude\n');
      assert.equal(result.stdout, '');
    });
  });

  it('answers antigravity with {} and exits 0 when stdin is not JSON', () => {
    for (const hookName of ['session-start', 'before-agent']) {
      const result = runAntigravityHook(ANTIGRAVITY_PLUGIN_ROOT, hookName, 'not-json');

      assert.equal(result.status, 0, `exit code for ${hookName}`);
      assert.match(result.stderr, /^Hook error: /);
      assert.deepEqual(JSON.parse(result.stdout), {});
    }
  });

  it('rejects a runtime without a hook adapter in the repo install, including the removed gemini runtime', () => {
    for (const runtime of ['codex', 'gemini']) {
      const result = runHook('hooks/hook-runner.js', runtime, 'session-start', {});

      assert.equal(result.status, 1, `exit code for ${runtime}`);
      assert.equal(result.stderr, `Unknown runtime: ${runtime}\n`);
      assert.equal(result.stdout, '');
    }
  });

  it('rejects other runtimes from an isolated claude plugin bundle', async () => {
    await withIsolatedClaudePlugin(async (pluginRoot) => {
      const result = runHook('scripts/hook-runner.js', 'qwen', 'session-start', {}, pluginRoot);

      assert.equal(result.status, 1);
      assert.equal(result.stderr, 'Unknown runtime: qwen\n');
      assert.equal(result.stdout, '');
    });
  });

  it('rejects bad invocations, checking the runtime before the hook name', () => {
    const usage = 'Usage: node hook-runner.js <runtime> <hook-name>\n';
    const cases = [
      [[], usage],
      [['qwen'], usage],
      [['qwen', 'nope'], 'Unknown hook: nope\n'],
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
    const result = runHook('hooks/hook-runner.js', 'qwen', 'session-start', 'not-json');

    assert.equal(result.status, 0);
    assert.match(result.stderr, /^Hook error: /);
    assert.deepEqual(JSON.parse(result.stdout), { continue: true, decision: 'allow' });
  });

  it('starts a session when a file blocks its per-session hook-state path', () => {
    // session-start used to create <MAESTRO_HOOKS_DIR>/<session> while a session
    // was active, so a file in the way made it fail (Claude: continue false).
    const sessionId = 'blocked-session';
    const blocker = path.join(HOOKS_DIR, sessionId);
    fs.writeFileSync(blocker, 'x');
    const workspace = makeWorkspace('maestro-blocked-', { session_id: 's1', status: 'in_progress', current_phase: 2 });
    try {
      const input = { session_id: sessionId, cwd: workspace, hook_event_name: 'SessionStart' };
      const claude = runHook('claude/scripts/hook-runner.js', 'claude', 'session-start', input);
      const qwen = runHook('hooks/hook-runner.js', 'qwen', 'session-start', input);

      assert.equal(claude.status, 0);
      assert.equal(claude.stderr, '');
      assert.deepEqual(JSON.parse(claude.stdout), { continue: true, decision: 'approve' });
      assert.equal(qwen.status, 0);
      assert.equal(qwen.stderr, '');
      assert.deepEqual(JSON.parse(qwen.stdout), {});
    } finally {
      fs.rmSync(blocker, { force: true });
    }
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

  it('keeps hook state under <os.tmpdir()>/maestro-hooks-<uid> when MAESTRO_HOOKS_DIR is unset', {
    skip: process.platform === 'win32' && 'os.tmpdir() ignores TMPDIR on Windows',
  }, () => {
    // Hosts never set MAESTRO_HOOKS_DIR; point os.tmpdir() at a private dir to
    // exercise the production default without touching the shared one.
    const tmpRoot = makeTempDir('maestro-hooks-default-');
    const env = { ...process.env, TMPDIR: tmpRoot };
    delete env.MAESTRO_HOOKS_DIR;

    const result = spawnSync(process.execPath, ['hooks/hook-runner.js', 'qwen', 'before-agent'], {
      cwd: ROOT,
      env,
      input: `${JSON.stringify({
        cwd: ROOT,
        session_id: 'hook-default-dir',
        hook_event_name: 'SubagentStart',
        agent_type: 'coder',
      })}\n`,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const uid = process.getuid ? process.getuid() : 'default';
    const activeAgentFile = path.join(tmpRoot, `maestro-hooks-${uid}`, 'hook-default-dir', 'active-agent');
    assert.equal(fs.readFileSync(activeAgentFile, 'utf8').trim(), 'coder');
  });
});
