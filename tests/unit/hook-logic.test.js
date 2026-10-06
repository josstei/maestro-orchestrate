'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

const hooksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-hooks-test-'));
process.env.MAESTRO_HOOKS_DIR = hooksDir;
// Hooks resolve the git toplevel of their cwd; keep fixture dirs from resolving
// to an enclosing checkout when the temp dir happens to live inside one.
process.env.GIT_CEILING_DIRECTORIES = fs.realpathSync(os.tmpdir());

const { execFileSync } = require('child_process');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const hookState = require('../../src/hooks/logic/hook-state');
const { handleAfterAgent } = require('../../src/hooks/logic/after-agent-logic');
const { handleBeforeAgent } = require('../../src/hooks/logic/before-agent-logic');
const { handleSessionStart } = require('../../src/hooks/logic/session-start-logic');
const { handleSessionEnd } = require('../../src/hooks/logic/session-end-logic');
const markdownState = require('../../src/core/markdown-state');

const SESSION_ID = 'test-session-abc123';

function makeGitWorkspace(prefix) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const subdir = path.join(root, 'pkg', 'sub');
  fs.mkdirSync(subdir, { recursive: true });
  return { root, subdir };
}

function writeMcpSession(stateDir, data) {
  const sessionFilePath = path.join(stateDir, 'state', 'active-session.md');
  fs.mkdirSync(path.dirname(sessionFilePath), { recursive: true });
  fs.writeFileSync(sessionFilePath, markdownState.serialize(data, '# Session\n'), 'utf8');
}

function withStateDirEnv(value, fn) {
  const original = process.env.MAESTRO_STATE_DIR;
  process.env.MAESTRO_STATE_DIR = value;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.MAESTRO_STATE_DIR;
    else process.env.MAESTRO_STATE_DIR = original;
  }
}
const VALID_RESULT = '## Task Report\nDone.\n\n## Downstream Context\nContext info.';

describe('handleAfterAgent', () => {
  after(() => {
    hookState.removeSessionDir(SESSION_ID);
  });

  function seedActiveAgent(agentName = 'coder') {
    hookState.ensureSessionDir(SESSION_ID);
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
    fakeCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cwd-test-'));
  });

  after(() => {
    fs.rmSync(fakeCwd, { recursive: true, force: true });
    hookState.removeSessionDir(SESSION_ID);
    delete process.env.MAESTRO_CURRENT_AGENT;
  });

  it('returns allow with null message when no session file exists', () => {
    delete process.env.MAESTRO_CURRENT_AGENT;
    const cwdWithNoSession = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-nosession-'));
    try {
      const result = handleBeforeAgent({
        sessionId: SESSION_ID,
        cwd: cwdWithNoSession,
        agentInput: null,
        event: 'BeforeAgent',
      });
      assert.equal(result.action, 'allow');
      assert.equal(result.message, null);
    } finally {
      fs.rmSync(cwdWithNoSession, { recursive: true, force: true });
    }
  });

  it('returns allow with context message when session file has phase/status info', () => {
    delete process.env.MAESTRO_CURRENT_AGENT;
    const sessionFilePath = path.join(fakeCwd, 'docs', 'maestro', 'state', 'active-session.md');
    fs.mkdirSync(path.dirname(sessionFilePath), { recursive: true });
    fs.writeFileSync(sessionFilePath, '---\ncurrent_phase: implementation\nstatus: active\n---\n', 'utf8');

    const result = handleBeforeAgent({
      sessionId: SESSION_ID,
      cwd: fakeCwd,
      agentInput: null,
      event: 'BeforeAgent',
    });

    assert.equal(result.action, 'allow');
    assert.ok(typeof result.message === 'string' && result.message.length > 0);
    assert.ok(result.message.includes('implementation'));
    assert.ok(result.message.includes('active'));
  });

  it('reads phase/status from the JSON frontmatter that create_session writes', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-json-session-'));
    try {
      writeMcpSession(path.join(cwd, 'docs', 'maestro'), {
        session_id: 's1',
        status: 'in_progress',
        current_phase: 1,
        phases: [{ id: 1, status: 'pending' }],
      });
      const result = handleBeforeAgent({ sessionId: SESSION_ID, cwd, agentInput: null });
      assert.equal(result.action, 'allow');
      assert.equal(result.message, 'Active session: current_phase=1, status=in_progress');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('omits a null current_phase from JSON frontmatter', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-json-null-'));
    try {
      writeMcpSession(path.join(cwd, 'docs', 'maestro'), { status: 'in_progress', current_phase: null });
      const result = handleBeforeAgent({ sessionId: SESSION_ID, cwd, agentInput: null });
      assert.equal(result.message, 'Active session: status=in_progress');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('finds the session at the git root when fired from a subdirectory', () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-subdir-');
    try {
      writeMcpSession(path.join(root, 'docs', 'maestro'), { status: 'in_progress', current_phase: 2 });
      const result = handleBeforeAgent({ sessionId: SESSION_ID, cwd: subdir, agentInput: null });
      assert.equal(result.message, 'Active session: current_phase=2, status=in_progress');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves an absolute MAESTRO_STATE_DIR from a subdirectory without throwing', () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-absstate-');
    try {
      writeMcpSession(path.join(root, '.maestro'), { status: 'in_progress', current_phase: 3 });
      const result = withStateDirEnv(path.join(root, '.maestro'), () =>
        handleBeforeAgent({ sessionId: SESSION_ID, cwd: subdir, agentInput: null })
      );
      assert.equal(result.action, 'allow');
      assert.equal(result.message, 'Active session: current_phase=3, status=in_progress');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves the git root from the process cwd when the payload has no cwd', () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-nocwd-');
    const originalCwd = process.cwd();
    try {
      writeMcpSession(path.join(root, 'docs', 'maestro'), { status: 'in_progress', current_phase: 4 });
      process.chdir(subdir);
      const result = handleBeforeAgent({ sessionId: SESSION_ID, cwd: '', agentInput: null });
      assert.equal(result.message, 'Active session: current_phase=4, status=in_progress');
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows with no context when the state dir cannot be resolved', () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-badstate-');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-outside-'));
    try {
      const result = withStateDirEnv(outside, () =>
        handleBeforeAgent({ sessionId: SESSION_ID, cwd: subdir, agentInput: null })
      );
      assert.deepEqual(result, { action: 'allow', message: null, reason: null });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('detects agent from prompt and sets active agent', () => {
    delete process.env.MAESTRO_CURRENT_AGENT;
    hookState.clearActiveAgent(SESSION_ID);

    handleBeforeAgent({
      sessionId: SESSION_ID,
      cwd: fakeCwd,
      agentInput: 'agent: coder\nPlease implement the feature.',
      event: 'BeforeAgent',
    });

    const activeAgent = hookState.getActiveAgent(SESSION_ID);
    assert.equal(activeAgent, 'coder');
  });

  it('uses normalized agentName when no prompt is available', () => {
    delete process.env.MAESTRO_CURRENT_AGENT;
    hookState.clearActiveAgent(SESSION_ID);

    handleBeforeAgent({
      sessionId: SESSION_ID,
      cwd: fakeCwd,
      agentName: 'code-reviewer',
      agentInput: null,
      event: 'SubagentStart',
    });

    const activeAgent = hookState.getActiveAgent(SESSION_ID);
    assert.equal(activeAgent, 'code_reviewer');
  });
});

describe('handleSessionStart', () => {
  let fakeCwd;

  before(() => {
    fakeCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-sessionstart-'));
  });

  after(() => {
    fs.rmSync(fakeCwd, { recursive: true, force: true });
    hookState.removeSessionDir(SESSION_ID);
  });

  it('returns advisory with null message/reason', () => {
    const result = handleSessionStart({ sessionId: SESSION_ID, cwd: fakeCwd });
    assert.equal(result.action, 'advisory');
    assert.equal(result.message, null);
    assert.equal(result.reason, null);
  });

  it('ensures session dir when active session exists', () => {
    const sessionFilePath = path.join(fakeCwd, 'docs', 'maestro', 'state', 'active-session.md');
    fs.mkdirSync(path.dirname(sessionFilePath), { recursive: true });
    fs.writeFileSync(sessionFilePath, '---\nstatus: active\n---\n', 'utf8');

    handleSessionStart({ sessionId: SESSION_ID, cwd: fakeCwd });

    const sessionDir = path.join(hooksDir, SESSION_ID);
    assert.ok(fs.existsSync(sessionDir));
  });

  it('returns advisory for a non-string cwd instead of throwing', () => {
    const result = handleSessionStart({ sessionId: SESSION_ID, cwd: 42 });
    assert.deepEqual(result, { action: 'advisory', message: null, reason: null });
  });

  it('finds the session at the git root when started from a subdirectory', () => {
    const { root, subdir } = makeGitWorkspace('maestro-git-start-');
    const sessionId = 'subdir-start-session';
    try {
      writeMcpSession(path.join(root, 'docs', 'maestro'), { status: 'in_progress', current_phase: 1 });
      handleSessionStart({ sessionId, cwd: subdir });
      assert.ok(fs.existsSync(path.join(hooksDir, sessionId)));
    } finally {
      hookState.removeSessionDir(sessionId);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('handleSessionEnd', () => {
  it('returns advisory with null message/reason', () => {
    const result = handleSessionEnd({ sessionId: SESSION_ID });
    assert.equal(result.action, 'advisory');
    assert.equal(result.message, null);
    assert.equal(result.reason, null);
  });

  it('removes session directory', () => {
    hookState.ensureSessionDir(SESSION_ID);
    const sessionDir = path.join(hooksDir, SESSION_ID);
    assert.ok(fs.existsSync(sessionDir));

    handleSessionEnd({ sessionId: SESSION_ID });

    assert.ok(!fs.existsSync(sessionDir));
  });
});
