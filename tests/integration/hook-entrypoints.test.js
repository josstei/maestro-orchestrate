'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ISOLATED_GIT_ENV } = require('../support/env');
const { makeTempDir } = require('../support/fs');
const { ROOT } = require('../support/paths');
const { expectExit, runNode } = require('../support/process');
const { writeSessionState } = require('../support/session-file');

// Hooks keep per-session state under MAESTRO_HOOKS_DIR; give them a private
// one instead of the shared default under os.tmpdir().
const HOOKS_DIR = makeTempDir('maestro-hooks-test-');

function runHook(relativePath, runtime, hookName, input, cwd = ROOT, env = {}) {
  return runNode(relativePath, [runtime, hookName], {
    cwd,
    env: { ...process.env, MAESTRO_HOOKS_DIR: HOOKS_DIR, ...env },
    input: typeof input === 'string' ? input : `${JSON.stringify(input)}\n`,
  });
}

// The parsed stdout of a hook run that must have exited 0.
function okJson(result, hookName) {
  assert.equal(result.status, 0, `${hookName} exited non-zero: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

// A Qwen payload for the `event` hook, sent from the repo checkout.
function qwenPayload(event, fields = {}) {
  return { cwd: ROOT, session_id: 'hook-test-session', hook_event_name: event, ...fields };
}

// Antigravity runs hooks from the plugin root and names the workspace in a
// camelCase payload, so session state is read from workspacePaths[0].
const ANTIGRAVITY_PLUGIN_ROOT = path.join(ROOT, 'antigravity');

function runAntigravityHook(hookName, input) {
  return runHook('hooks/hook-runner.js', 'antigravity', hookName, input, ANTIGRAVITY_PLUGIN_ROOT, ISOLATED_GIT_ENV);
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
  if (session) writeSessionState(workspace, session);
  return workspace;
}

describe('hook entrypoints', () => {
  it('boots claude hook adapters against canonical src hook logic', () => {
    for (const hookName of ['session-start', 'before-agent', 'session-end']) {
      const result = runHook('claude/scripts/hook-runner.js', 'claude', hookName, { cwd: ROOT, session_id: 'hook-test-session' });
      okJson(result, hookName);
    }
  });

  it('boots antigravity SessionStart hooks from the plugin root against canonical src hook logic', () => {
    const idle = antigravityPayload(makeWorkspace('maestro-antigravity-idle-'));
    for (const hookName of ['session-start', 'before-agent']) {
      const result = runAntigravityHook(hookName, idle);
      assert.deepEqual(okJson(result, hookName), {}, `${hookName} without an active session`);
    }

    const active = antigravityPayload(
      makeWorkspace('maestro-antigravity-active-', { session_id: 's1', status: 'in_progress', current_phase: 2 })
    );

    assert.deepEqual(okJson(runAntigravityHook('session-start', active), 'session-start'), {});
    assert.deepEqual(okJson(runAntigravityHook('before-agent', active), 'before-agent'), {
      injectSteps: [{ systemMessage: { systemMessage: 'Active session: current_phase=2, status=in_progress' } }],
    });
    // Antigravity has no session-end hook and its payload names no agent, so
    // neither hook may leave per-conversation hook state behind.
    assert.equal(fs.existsSync(path.join(HOOKS_DIR, active.conversationId)), false,
      'Antigravity hooks must not create per-conversation hook state');
  });

  it('rejects bad invocations, checking the runtime before the hook name', () => {
    const usage = 'Usage: node hook-runner.js <runtime> <hook-name>\n';
    const cases = [
      [[], usage],
      [['qwen'], usage],
      [['qwen', 'nope'], 'Unknown hook: nope\n'],
      [['bogus', 'nope'], 'Unknown runtime: bogus\n'],
      // Codex has no hook adapter in the repo install, and gemini was removed.
      [['codex', 'session-start'], 'Unknown runtime: codex\n'],
      [['gemini', 'session-start'], 'Unknown runtime: gemini\n'],
    ];

    for (const [args, stderr] of cases) {
      const result = runNode('hooks/hook-runner.js', args, { input: '{}\n' });

      expectExit(result, { status: 1, stderr, stdout: '' }, `exit for [${args.join(' ')}]`);
    }
  });

  it('answers with the adapter error fallback when stdin is not JSON or over the 1 MiB cap', () => {
    const oversize = JSON.stringify({ data: 'a'.repeat(1024 * 1024 + 10) });
    for (const [launcher, runtime, fallback] of [
      ['antigravity/hooks/hook-runner.js', 'antigravity', {}],
      ['claude/scripts/hook-runner.js', 'claude', { continue: false, decision: 'block' }],
      ['hooks/hook-runner.js', 'qwen', { continue: true, decision: 'allow' }],
    ]) {
      const notJson = runHook(launcher, runtime, 'session-start', 'not-json');
      assert.equal(notJson.status, 0, `${runtime}: stdin not JSON`);
      assert.match(notJson.stderr, /^Hook error: .*JSON/);
      assert.deepEqual(JSON.parse(notJson.stdout), fallback);

      expectExit(runHook(launcher, runtime, 'session-start', oversize),
        { status: 0, stderr: 'Hook error: Stdin payload too large\n', stdout: `${JSON.stringify(fallback)}\n` },
        `${runtime}: oversize stdin`);
    }
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

      expectExit(claude, { status: 0, stderr: '' });
      assert.deepEqual(JSON.parse(claude.stdout), { continue: true, decision: 'approve' });
      expectExit(qwen, { status: 0, stderr: '' });
      assert.deepEqual(JSON.parse(qwen.stdout), {});
    } finally {
      fs.rmSync(blocker, { force: true });
    }
  });

  it('boots qwen hook adapters against canonical src hook logic', () => {
    const cases = [
      ['session-start', qwenPayload('SessionStart')],
      ['before-agent', qwenPayload('SubagentStart', { agent_type: 'coder' })],
      ['after-agent', qwenPayload('SubagentStop', {
        agent_type: 'coder',
        last_assistant_message: '## Task Report\nDone.\n\n## Downstream Context\nNext steps.',
      })],
      ['session-end', qwenPayload('SessionEnd')],
    ];

    for (const [hookName, payload] of cases) {
      okJson(runHook('hooks/hook-runner.js', 'qwen', hookName, payload), hookName);
    }
  });

  it('exits with code 2 when a qwen hook denies execution', () => {
    const start = runHook('hooks/hook-runner.js', 'qwen', 'before-agent',
      qwenPayload('SubagentStart', { agent_type: 'coder' }));
    okJson(start, 'before-agent');

    const result = runHook('hooks/hook-runner.js', 'qwen', 'after-agent',
      qwenPayload('SubagentStop', { agent_type: 'coder', last_assistant_message: 'Missing required sections' }));

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

    const payload = qwenPayload('SubagentStart', { session_id: 'hook-default-dir', agent_type: 'coder' });
    const result = runNode('hooks/hook-runner.js', ['qwen', 'before-agent'], {
      env,
      input: `${JSON.stringify(payload)}\n`,
    });

    assert.equal(result.status, 0, result.stderr);
    const uid = process.getuid ? process.getuid() : 'default';
    const activeAgentFile = path.join(tmpRoot, `maestro-hooks-${uid}`, 'hook-default-dir', 'active-agent');
    assert.equal(fs.readFileSync(activeAgentFile, 'utf8').trim(), 'coder');
  });
});
