'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

const hooksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-hooks-test-'));
process.env.MAESTRO_HOOKS_DIR = hooksDir;

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const hookState = require('../../src/hooks/logic/hook-state');
const { handleAfterAgent } = require('../../src/hooks/logic/after-agent-logic');
const { handleBeforeAgent } = require('../../src/hooks/logic/before-agent-logic');
const { handleSessionStart } = require('../../src/hooks/logic/session-start-logic');
const { handleSessionEnd } = require('../../src/hooks/logic/session-end-logic');

const SESSION_ID = 'test-session-abc123';
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
