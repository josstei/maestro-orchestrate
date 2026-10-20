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

const SESSION_ID = 'test-session-abc123';

function makeGitWorkspace(prefix) {
  const root = fs.realpathSync(makeTempDir(prefix));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const subdir = path.join(root, 'pkg', 'sub');
  fs.mkdirSync(subdir, { recursive: true });
  return { root, subdir };
}

const VALID_RESULT = '## Task Report\nDone.\n\n## Downstream Context\nContext info.';

describe('handleAfterAgent', () => {
  after(() => {
    hookState.removeSessionDir(SESSION_ID);
  });

  function seedActiveAgent(agentName = 'coder') {
    hookState.setActiveAgent(SESSION_ID, agentName);
  }

  it('returns allow with null message/reason when no active agent is set', () => {
    hookState.clearActiveAgent(SESSION_ID);
    const result = handleAfterAgent({ sessionId: SESSION_ID, agentResult: '', stopHookActive: false });
    assert.equal(result.action, 'allow');
    assert.equal(result.message, null);
    assert.equal(result.reason, null);
  });

  it('returns deny when agentResult is missing ## Task Report', () => {
    seedActiveAgent();
    const result = handleAfterAgent({
      sessionId: SESSION_ID,
      agentResult: '## Downstream Context\nContext info.',
      stopHookActive: false,
    });
    assert.equal(result.action, 'deny');
    assert.ok(result.reason.includes('Task Report'));
  });

  it('returns deny when agentResult is missing ## Downstream Context', () => {
    seedActiveAgent();
    const result = handleAfterAgent({
      sessionId: SESSION_ID,
      agentResult: '## Task Report\nDone.',
      stopHookActive: false,
    });
    assert.equal(result.action, 'deny');
    assert.ok(result.reason.includes('Downstream Context'));
  });

  it('returns deny when both sections are missing', () => {
    seedActiveAgent();
    const result = handleAfterAgent({
      sessionId: SESSION_ID,
      agentResult: 'No structured output here.',
      stopHookActive: false,
    });
    assert.equal(result.action, 'deny');
    assert.ok(result.reason.includes('Task Report'));
    assert.ok(result.reason.includes('Downstream Context'));
  });

  it('returns allow when both sections are present', () => {
    seedActiveAgent();
    const result = handleAfterAgent({
      sessionId: SESSION_ID,
      agentResult: VALID_RESULT,
      stopHookActive: false,
    });
    assert.equal(result.action, 'allow');
    assert.equal(result.message, null);
    assert.equal(result.reason, null);
  });

  it('returns allow (not deny) when stopHookActive is true even if sections missing', () => {
    seedActiveAgent();
    const result = handleAfterAgent({
      sessionId: SESSION_ID,
      agentResult: 'No structured output.',
      stopHookActive: true,
    });
    assert.equal(result.action, 'allow');
  });

  it('accepts single-# headings', () => {
    seedActiveAgent();
    const result = handleAfterAgent({
      sessionId: SESSION_ID,
      agentResult: '# Task Report\nDone.\n\n# Downstream Context\nContext info.',
    });
    assert.equal(result.action, 'allow');
  });

  it('treats a missing or non-text response as one without headings and clears the agent', () => {
    // Hook stdin is arbitrary JSON: a number used to throw (leaving the agent
    // recorded) and an array of heading strings used to pass.
    for (const agentResult of [undefined, 42, { text: VALID_RESULT }, ['## Task Report', '## Downstream Context']]) {
      seedActiveAgent();
      const result = handleAfterAgent({ sessionId: SESSION_ID, agentResult });
      assert.equal(result.action, 'deny', JSON.stringify(agentResult));
      assert.ok(result.reason.includes('Missing Task Report section'));
      assert.ok(result.reason.includes('Missing Downstream Context section'));
      assert.equal(hookState.getActiveAgent(SESSION_ID), '');
    }
  });

  it('clears active agent after processing', () => {
    seedActiveAgent();
    handleAfterAgent({ sessionId: SESSION_ID, agentResult: VALID_RESULT, stopHookActive: false });
    const agent = hookState.getActiveAgent(SESSION_ID);
    assert.equal(agent, '');
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

  it('returns allow with null message when no session file exists', () => {
    const cwdWithNoSession = makeTempDir('maestro-nosession-');
    const result = handleBeforeAgent({
      sessionId: SESSION_ID,
      cwd: cwdWithNoSession,
      agentInput: null,
    });
    assert.equal(result.action, 'allow');
    assert.equal(result.message, null);
  });

  it('returns allow with context message when session file has phase/status info', () => {
    writeFile(activeSessionPath(fakeCwd), '---\ncurrent_phase: implementation\nstatus: active\n---\n');

    const result = handleBeforeAgent({
      sessionId: SESSION_ID,
      cwd: fakeCwd,
      agentInput: null,
    });

    assert.equal(result.action, 'allow');
    assert.ok(typeof result.message === 'string' && result.message.length > 0);
    assert.ok(result.message.includes('implementation'));
    assert.ok(result.message.includes('active'));
  });

  it('reads phase/status from the JSON frontmatter that create_session writes', () => {
    const cwd = makeTempDir('maestro-json-session-');
    writeSessionState(cwd, {
      session_id: 's1',
      status: 'in_progress',
      current_phase: 1,
      phases: [{ id: 1, status: 'pending' }],
    });
    const result = handleBeforeAgent({ sessionId: SESSION_ID, cwd, agentInput: null });
    assert.equal(result.action, 'allow');
    assert.equal(result.message, 'Active session: current_phase=1, status=in_progress');
  });

  it('omits a null current_phase from JSON frontmatter', () => {
    const cwd = makeTempDir('maestro-json-null-');
    writeSessionState(cwd, { status: 'in_progress', current_phase: null });
    const result = handleBeforeAgent({ sessionId: SESSION_ID, cwd, agentInput: null });
    assert.equal(result.message, 'Active session: status=in_progress');
  });

  it('finds the session at the git root when fired from a subdirectory', () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-subdir-');
    writeSessionState(root, { status: 'in_progress', current_phase: 2 });
    const result = handleBeforeAgent({ sessionId: SESSION_ID, cwd: subdir, agentInput: null });
    assert.equal(result.message, 'Active session: current_phase=2, status=in_progress');
  });

  it('resolves an absolute MAESTRO_STATE_DIR from a subdirectory without throwing', () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-absstate-');
    writeSessionState(root, { status: 'in_progress', current_phase: 3 }, '.maestro');
    const result = withEnv({ MAESTRO_STATE_DIR: path.join(root, '.maestro') }, () =>
      handleBeforeAgent({ sessionId: SESSION_ID, cwd: subdir, agentInput: null })
    );
    assert.equal(result.action, 'allow');
    assert.equal(result.message, 'Active session: current_phase=3, status=in_progress');
  });

  it('reads the session under the state dir named in the workspace .env', () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-envstate-');
    fs.writeFileSync(path.join(root, '.env'), 'MAESTRO_STATE_DIR=.maestro\n');
    writeSessionState(root, { status: 'in_progress', current_phase: 5 }, '.maestro');
    const result = withEnv({ MAESTRO_STATE_DIR: null }, () =>
      handleBeforeAgent({ sessionId: SESSION_ID, cwd: subdir, agentInput: null })
    );
    assert.equal(result.message, 'Active session: current_phase=5, status=in_progress');
  });

  it('resolves the git root from the process cwd when the payload has no cwd', () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-nocwd-');
    writeSessionState(root, { status: 'in_progress', current_phase: 4 });
    const result = withCwd(subdir, () =>
      handleBeforeAgent({ sessionId: SESSION_ID, cwd: '', agentInput: null })
    );
    assert.equal(result.message, 'Active session: current_phase=4, status=in_progress');
  });

  it('reads the session under the raw process cwd when the payload has no cwd and that cwd is not a concrete path', () => {
    const workspace = path.join(fs.realpathSync(makeTempDir('maestro-nocwd-placeholder-')), '${workspace}');
    writeSessionState(workspace, { status: 'in_progress', current_phase: 6 });
    const result = withCwd(workspace, () =>
      handleBeforeAgent({ sessionId: SESSION_ID, cwd: undefined, agentInput: null })
    );
    assert.equal(result.message, 'Active session: current_phase=6, status=in_progress');
  });

  it('allows with no context for a non-string cwd instead of throwing', () => {
    const result = handleBeforeAgent({ sessionId: SESSION_ID, cwd: 42, agentInput: null });
    assert.deepEqual(result, { action: 'allow', message: null, reason: null });
  });

  it('allows with no context when the state dir cannot be resolved', () => {
    const { subdir } = makeGitWorkspace('maestro-git-badstate-');
    const outside = makeTempDir('maestro-outside-');
    const result = withEnv({ MAESTRO_STATE_DIR: outside }, () =>
      handleBeforeAgent({ sessionId: SESSION_ID, cwd: subdir, agentInput: null })
    );
    assert.deepEqual(result, { action: 'allow', message: null, reason: null });
  });

  /** The active agent handleBeforeAgent records for a prompt when the adapter names no agent. */
  function detectedAgent(agentInput) {
    hookState.clearActiveAgent(SESSION_ID);
    handleBeforeAgent({ sessionId: SESSION_ID, cwd: fakeCwd, agentName: null, agentInput });
    return hookState.getActiveAgent(SESSION_ID);
  }

  it('detects the agent from an "agent:" header', () => {
    assert.equal(detectedAgent('agent: coder\nPlease implement the feature.'), 'coder');
  });

  it('normalizes a kebab-case header agent to snake_case', () => {
    assert.equal(detectedAgent('agent: code-reviewer\n\nReview this PR.'), 'code_reviewer');
  });

  it('detects an @mention', () => {
    assert.equal(detectedAgent('Please ask @code_reviewer to check this.'), 'code_reviewer');
  });

  it('detects "delegate to" and "hand off to" phrasing', () => {
    assert.equal(detectedAgent('delegate to coder for implementation'), 'coder');
    assert.equal(detectedAgent('hand off to debugger for investigation'), 'debugger');
  });

  it('records no agent for an empty, missing or agent-free prompt', () => {
    assert.equal(detectedAgent(''), '');
    assert.equal(detectedAgent(null), '');
    assert.equal(detectedAgent('Just a normal message with no agent.'), '');
  });

  it('falls back to MAESTRO_CURRENT_AGENT when the prompt has no header', () => {
    const agent = withEnv({ MAESTRO_CURRENT_AGENT: 'tester' }, () =>
      detectedAgent('Run all tests please.')
    );
    assert.equal(agent, 'tester');
  });

  it('prefers the header agent over MAESTRO_CURRENT_AGENT', () => {
    const agent = withEnv({ MAESTRO_CURRENT_AGENT: 'tester' }, () =>
      detectedAgent('agent: coder\n\nImplement the feature.')
    );
    assert.equal(agent, 'coder');
  });

  it('ignores a header or MAESTRO_CURRENT_AGENT that names no registered agent', () => {
    const agent = withEnv({ MAESTRO_CURRENT_AGENT: 'constructor' }, () =>
      detectedAgent('agent: wizard\ninvoke refactor now')
    );
    assert.equal(agent, 'refactor');
  });

  it('returns the session context without recording an agent when the payload names none', () => {
    // Antigravity runs before-agent on SessionStart, whose payload has no agent name or prompt.
    hookState.clearActiveAgent(SESSION_ID);
    const cwd = makeTempDir('maestro-json-noagent-');
    writeSessionState(cwd, { status: 'in_progress', current_phase: 2 });

    const result = handleBeforeAgent({ sessionId: SESSION_ID, cwd, agentName: null, agentInput: null });

    assert.deepEqual(result, {
      action: 'allow',
      message: 'Active session: current_phase=2, status=in_progress',
      reason: null,
    });
    assert.equal(hookState.getActiveAgent(SESSION_ID), '');
  });

  it('uses normalized agentName when no prompt is available', () => {
    hookState.clearActiveAgent(SESSION_ID);

    handleBeforeAgent({
      sessionId: SESSION_ID,
      cwd: fakeCwd,
      agentName: 'code-reviewer',
      agentInput: null,
    });

    const activeAgent = hookState.getActiveAgent(SESSION_ID);
    assert.equal(activeAgent, 'code_reviewer');
  });
});

describe('handleSessionStart', () => {
  let fakeCwd;

  before(() => {
    fakeCwd = makeTempDir('maestro-sessionstart-');
  });

  after(() => {
    hookState.removeSessionDir(SESSION_ID);
  });

  it('returns allow with null message/reason', () => {
    const result = handleSessionStart({ sessionId: SESSION_ID, cwd: fakeCwd });
    assert.equal(result.action, 'allow');
    assert.equal(result.message, null);
    assert.equal(result.reason, null);
  });

  it('prunes stale session dirs without creating one for the starting session', () => {
    // before-agent creates the session dir when it records the active agent;
    // session-start leaves none behind, even with an active session (Antigravity
    // runs it for every conversation and has no session-end to remove one).
    writeFile(activeSessionPath(fakeCwd), '---\nstatus: active\n---\n');
    hookState.removeSessionDir(SESSION_ID);
    const staleDir = path.join(hooksDir, 'stale-session');
    fs.mkdirSync(staleDir, { recursive: true });
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    fs.utimesSync(staleDir, threeHoursAgo, threeHoursAgo);

    handleSessionStart({ sessionId: SESSION_ID, cwd: fakeCwd });

    assert.equal(fs.existsSync(staleDir), false);
    assert.equal(fs.existsSync(path.join(hooksDir, SESSION_ID)), false);
  });

});

describe('handleSessionEnd', () => {
  it('returns allow with null message/reason', () => {
    const result = handleSessionEnd({ sessionId: SESSION_ID });
    assert.equal(result.action, 'allow');
    assert.equal(result.message, null);
    assert.equal(result.reason, null);
  });

  it('removes session directory', () => {
    hookState.setActiveAgent(SESSION_ID, 'coder');
    const sessionDir = path.join(hooksDir, SESSION_ID);
    assert.ok(fs.existsSync(sessionDir));

    handleSessionEnd({ sessionId: SESSION_ID });

    assert.ok(!fs.existsSync(sessionDir));
  });
});
