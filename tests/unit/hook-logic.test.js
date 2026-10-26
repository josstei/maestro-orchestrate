'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { ISOLATED_GIT_ENV, withCwd, withEnv } = require('../support/env');
const { makeTempDir, writeFile } = require('../support/fs');

const hooksDir = makeTempDir('maestro-hooks-test-');
process.env.MAESTRO_HOOKS_DIR = hooksDir;
// Hooks resolve the git toplevel of their cwd; keep fixture dirs from resolving
// to an enclosing checkout when the temp dir happens to live inside one.
Object.assign(process.env, ISOLATED_GIT_ENV);
// Agent detection falls back to MAESTRO_CURRENT_AGENT; keep an inherited value
// out of the detection tests.
delete process.env.MAESTRO_CURRENT_AGENT;

const { execFileSync } = require('node:child_process');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const hookState = require('../../src/hooks/logic/hook-state');
const { handleAfterAgent } = require('../../src/hooks/logic/after-agent-logic');
const { handleBeforeAgent } = require('../../src/hooks/logic/before-agent-logic');
const { handleSessionStart } = require('../../src/hooks/logic/session-start-logic');
const { handleSessionEnd } = require('../../src/hooks/logic/session-end-logic');
const { activeSessionPath, writeSessionState } = require('../support/session-file');
const { acquireStateLock } = require('../../src/state/state-lock');
const { controlDir, leaveCommitted } = require('../support/state');

const SESSION_ID = 'test-session-abc123';

function makeGitWorkspace(prefix) {
  const root = fs.realpathSync(makeTempDir(prefix));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const subdir = path.join(root, 'pkg', 'sub');
  fs.mkdirSync(subdir, { recursive: true });
  return { root, subdir };
}

const VALID_RESULT = '## Task Report\nDone.\n\n## Downstream Context\nContext info.';
const ALLOW = { action: 'allow', message: null, reason: null };
const ADVISORY = { action: 'advisory', message: null, reason: null };

describe('handleAfterAgent', () => {
  after(() => {
    hookState.removeSessionDir(SESSION_ID);
  });

  function runWithAgent(agentResult, stopHookActive = false) {
    hookState.setActiveAgent(SESSION_ID, 'coder');
    return handleAfterAgent({ sessionId: SESSION_ID, agentResult, stopHookActive });
  }

  it('returns allow with null message/reason when no active agent is set', () => {
    hookState.clearActiveAgent(SESSION_ID);
    assert.deepEqual(handleAfterAgent({ sessionId: SESSION_ID, agentResult: '', stopHookActive: false }), ALLOW);
  });

  it('returns deny naming exactly the missing sections, in order', () => {
    for (const [agentResult, ...missing] of [
      ['## Downstream Context\nContext info.', 'Task Report'],
      ['## Task Report\nDone.', 'Downstream Context'],
      ['No structured output here.', 'Task Report', 'Downstream Context'],
    ]) {
      const result = runWithAgent(agentResult);
      assert.equal(result.action, 'deny');
      const warnings = missing.map((name) => `Missing ${name} section (expected ## ${name} heading)`).join('; ');
      assert.ok(result.reason.startsWith(`Handoff report validation failed: ${warnings}. `), result.reason);
    }
  });

  it('returns allow for a complete report or a stopHookActive retry, clearing the active agent', () => {
    assert.deepEqual(runWithAgent(VALID_RESULT), ALLOW);
    assert.equal(hookState.getActiveAgent(SESSION_ID), '');
    assert.deepEqual(runWithAgent('No structured output.', true), ALLOW);
  });
});

describe('handleBeforeAgent', () => {
  let fakeCwd;

  before(() => {
    fakeCwd = makeTempDir('maestro-cwd-test-');
  });

  after(() => {
    hookState.removeSessionDir(SESSION_ID);
  });

  function runBeforeAgent(cwd, fields) {
    return handleBeforeAgent({ sessionId: SESSION_ID, cwd, agentInput: null, ...fields });
  }

  it('returns allow with null message when no session file exists', async () => {
    assert.deepEqual(await runBeforeAgent(makeTempDir('maestro-nosession-')), ALLOW);
  });

  it('returns allow with context message when session file has phase/status info', async () => {
    writeFile(activeSessionPath(fakeCwd), '---\ncurrent_phase: implementation\nstatus: active\n---\n');
    const result = await runBeforeAgent(fakeCwd);
    assert.deepEqual(result, { ...ALLOW, message: 'Active session: current_phase=implementation, status=active' });
  });

  it('reads phase/status from the JSON frontmatter that create_session writes', async () => {
    const cwd = makeTempDir('maestro-json-session-');
    writeSessionState(cwd, {
      session_id: 's1',
      status: 'in_progress',
      current_phase: 1,
      phases: [{ id: 1, status: 'pending' }],
    });
    const result = await runBeforeAgent(cwd);
    assert.deepEqual(result, { ...ALLOW, message: 'Active session: current_phase=1, status=in_progress' });
  });

  it('omits a null current_phase from JSON frontmatter', async () => {
    const cwd = makeTempDir('maestro-json-null-');
    writeSessionState(cwd, { status: 'in_progress', current_phase: null });
    const result = await runBeforeAgent(cwd);
    assert.equal(result.message, 'Active session: status=in_progress');
  });

  it('finds the session at the git root when fired from a subdirectory', async () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-subdir-');
    writeSessionState(root, { status: 'in_progress', current_phase: 2 });
    const result = await runBeforeAgent(subdir);
    assert.equal(result.message, 'Active session: current_phase=2, status=in_progress');
  });

  it('resolves an absolute MAESTRO_STATE_DIR from a subdirectory without throwing', async () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-absstate-');
    writeSessionState(root, { status: 'in_progress', current_phase: 3 }, '.maestro');
    const result = await withEnv({ MAESTRO_STATE_DIR: path.join(root, '.maestro') }, () => runBeforeAgent(subdir));
    assert.deepEqual(result, { ...ALLOW, message: 'Active session: current_phase=3, status=in_progress' });
  });

  it('reads the session under the state dir named in the workspace .env', async () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-envstate-');
    fs.writeFileSync(path.join(root, '.env'), 'MAESTRO_STATE_DIR=.maestro\n');
    writeSessionState(root, { status: 'in_progress', current_phase: 5 }, '.maestro');
    const result = await withEnv({ MAESTRO_STATE_DIR: null }, () => runBeforeAgent(subdir));
    assert.equal(result.message, 'Active session: current_phase=5, status=in_progress');
  });

  it('resolves the git root from the process cwd when the payload has no cwd', async () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-nocwd-');
    writeSessionState(root, { status: 'in_progress', current_phase: 4 });
    const result = await withCwd(subdir, () => runBeforeAgent(''));
    assert.equal(result.message, 'Active session: current_phase=4, status=in_progress');
  });

  it('allows with no context for a non-string cwd instead of throwing', async () => {
    assert.deepEqual(await runBeforeAgent(42), ALLOW);
  });

  it('allows with no context when the state dir cannot be resolved', async () => {
    const { subdir } = makeGitWorkspace('maestro-git-badstate-');
    const outside = makeTempDir('maestro-outside-');
    const result = await withEnv({ MAESTRO_STATE_DIR: outside }, () => runBeforeAgent(subdir));
    assert.deepEqual(result, ALLOW);
  });

  it('detects agent from prompt and sets active agent', async () => {
    hookState.clearActiveAgent(SESSION_ID);
    await runBeforeAgent(fakeCwd, { agentInput: 'agent: coder\nPlease implement the feature.' });
    assert.equal(hookState.getActiveAgent(SESSION_ID), 'coder');
  });

  it('returns the session context without recording an agent when the payload names none', async () => {
    // Antigravity runs before-agent on SessionStart, whose payload has no agent name or prompt.
    hookState.clearActiveAgent(SESSION_ID);
    const cwd = makeTempDir('maestro-json-noagent-');
    writeSessionState(cwd, { status: 'in_progress', current_phase: 2 });

    const result = await runBeforeAgent(cwd, { agentName: null });

    assert.deepEqual(result, { ...ALLOW, message: 'Active session: current_phase=2, status=in_progress' });
    assert.equal(hookState.getActiveAgent(SESSION_ID), '');
  });

  it('uses normalized agentName when no prompt is available', async () => {
    hookState.clearActiveAgent(SESSION_ID);
    await runBeforeAgent(fakeCwd, { agentName: 'code-reviewer' });
    assert.equal(hookState.getActiveAgent(SESSION_ID), 'code_reviewer');
  });

  it('recovers an interrupted session update before summarizing it', async () => {
    const cwd = makeTempDir('maestro-hook-recovery-');
    writeSessionState(cwd, { status: 'in_progress', current_phase: 1 });
    await leaveCommitted(path.join(cwd, 'docs/maestro'), (tx) => tx.writeFile(activeSessionPath(cwd), '---\ncurrent_phase: recovered\nstatus: active\n---\n'));
    const result = await runBeforeAgent(cwd);
    assert.equal(result.message, 'Active session: current_phase=recovered, status=active');
  });

  it('warns and omits context within the hook budget when committed state is busy', { timeout: 2000 }, async (t) => {
    const cwd = makeTempDir('maestro-hook-busy-');
    writeSessionState(cwd, { status: 'in_progress', current_phase: 1 });
    const base = path.join(cwd, 'docs/maestro');
    const release = await acquireStateLock(controlDir(base));
    await leaveCommitted(base, (tx) => tx.writeFile(activeSessionPath(cwd), '---\nstatus: complete\n---\n'), { operation: 'pending_test_write' });
    const stderr = t.mock.method(process.stderr, 'write', () => true);
    try {
      assert.deepEqual(await runBeforeAgent(cwd), ALLOW);
      assert.ok(stderr.mock.calls.some(({ arguments: args }) => /\[WARN\].*busy/.test(args[0])));
    } finally {
      release();
    }
  });
});

describe('handleSessionStart', () => {
  it('prunes stale session dirs without creating one for the starting session', () => {
    // before-agent creates the session dir when it records the active agent;
    // session-start leaves none behind, even with an active session (Antigravity
    // runs it for every conversation and has no session-end to remove one).
    const cwd = makeTempDir('maestro-sessionstart-');
    writeFile(activeSessionPath(cwd), '---\nstatus: active\n---\n');
    hookState.removeSessionDir(SESSION_ID);
    const staleDir = path.join(hooksDir, 'stale-session');
    fs.mkdirSync(staleDir, { recursive: true });
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    fs.utimesSync(staleDir, threeHoursAgo, threeHoursAgo);

    assert.deepEqual(handleSessionStart({ sessionId: SESSION_ID, cwd }), ADVISORY);
    assert.equal(fs.existsSync(staleDir), false);
    assert.equal(fs.existsSync(path.join(hooksDir, SESSION_ID)), false);
  });
});

describe('handleSessionEnd', () => {
  it('removes session directory', () => {
    hookState.setActiveAgent(SESSION_ID, 'coder');
    const sessionDir = path.join(hooksDir, SESSION_ID);
    assert.ok(fs.existsSync(sessionDir));

    assert.deepEqual(handleSessionEnd({ sessionId: SESSION_ID }), ADVISORY);
    assert.ok(!fs.existsSync(sessionDir));
  });
});
