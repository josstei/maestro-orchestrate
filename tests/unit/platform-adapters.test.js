'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SRC_ROOT } = require('../support/paths');

const PLATFORMS_DIR = path.join(SRC_ROOT, 'platforms');
const ADAPTERS = Object.fromEntries(['antigravity', 'claude', 'qwen']
  .map((runtime) => [runtime, require(path.join(PLATFORMS_DIR, runtime, 'hook-adapter'))]));
const EMPTY_CTX = {
  sessionId: '', cwd: '', agentName: null, agentInput: null, agentResult: null, stopHookActive: false,
};
const REPORT = '## Task Report\nDone.\n\n## Downstream Context\nNext steps.';
const QWEN_RAW = { session_id: 'qwen-123', cwd: '/workspace/app', agent_type: 'coder', last_assistant_message: REPORT };
const QWEN_CTX = { ...EMPTY_CTX, sessionId: 'qwen-123', cwd: '/workspace/app', agentName: 'coder' };
const ACTIVE_SESSION = 'Active session: current_phase=2, status=in_progress';

// [runtime, case, raw stdin payload, whole normalized hook context]
const INPUTS = [
  ['antigravity', 'maps conversationId and the first workspace path', {
    conversationId: '6f1c2d3e-0000-4000-8000-000000000001',
    workspacePaths: ['/workspace/app', '/workspace/lib'],
    transcriptPath: '/tmp/conversation/transcript.jsonl',
    artifactDirectoryPath: '/tmp/conversation/artifacts',
    modelName: 'example-model',
  }, { ...EMPTY_CTX, sessionId: '6f1c2d3e-0000-4000-8000-000000000001', cwd: '/workspace/app' }],
  ['antigravity', 'skips empty and non-string workspace paths',
    { workspacePaths: ['', null, 7, '/workspace/app'] }, { ...EMPTY_CTX, cwd: '/workspace/app' }],
  ['antigravity', 'defaults missing fields', {}, EMPTY_CTX],
  ['antigravity', 'ignores a non-array workspacePaths', { workspacePaths: '/workspace/app' }, EMPTY_CTX],
  ['claude', 'maps the Task PreToolUse payload and ignores stop_hook_active', {
    session_id: 'abc-123',
    cwd: '/home/user/project',
    hook_event_name: 'PreToolUse',
    tool_input: { subagent_type: 'maestro:coder', prompt: 'Implement the feature.' },
    tool_result: 'The agent returned this output.',
    stop_hook_active: true,
  }, {
    sessionId: 'abc-123',
    cwd: '/home/user/project',
    agentName: 'maestro:coder',
    agentInput: 'Implement the feature.',
    agentResult: 'The agent returned this output.',
    stopHookActive: false,
  }],
  ['claude', 'defaults missing fields', {}, EMPTY_CTX],
  ['qwen', 'maps SubagentStart without an agent result',
    { ...QWEN_RAW, hook_event_name: 'SubagentStart' }, QWEN_CTX],
  ['qwen', 'maps SubagentStop with last_assistant_message as the agent result',
    { ...QWEN_RAW, hook_event_name: 'SubagentStop' }, { ...QWEN_CTX, agentResult: REPORT }],
  ['qwen', 'reads stop_hook_active true', { stop_hook_active: true }, { ...EMPTY_CTX, stopHookActive: true }],
  ['qwen', 'reads stop_hook_active "true"', { stop_hook_active: 'true' }, { ...EMPTY_CTX, stopHookActive: true }],
];

// [runtime, case, hook result, whole runtime stdout object]
const OUTPUTS = [
  ['antigravity', 'returns {} without a message', { action: 'advisory', message: null, reason: null }, {}],
  ['antigravity', 'returns {} for a silent allow', { action: 'allow', message: null, reason: null }, {}],
  ['antigravity', 'injects a message as a system message step',
    { action: 'allow', message: ACTIVE_SESSION, reason: null },
    { injectSteps: [{ systemMessage: { systemMessage: ACTIVE_SESSION } }] }],
  ['claude', 'approves with the message as systemMessage', { action: 'allow', message: 'All good.' },
    { continue: true, decision: 'approve', systemMessage: 'All good.', reason: undefined }],
  ['claude', 'blocks a deny with its reason as systemMessage', { action: 'deny', reason: 'Policy violation.' },
    { continue: false, decision: 'block', systemMessage: 'Policy violation.', reason: 'Policy violation.' }],
  ['qwen', 'blocks a deny with its reason', { action: 'deny', reason: 'Blocked.' },
    { continue: false, decision: 'block', reason: 'Blocked.' }],
  ['qwen', 'carries a message as additionalContext', { action: 'allow', message: 'Context.' },
    { hookSpecificOutput: { additionalContext: 'Context.' } }],
];

describe('hook adapters', () => {
  it('ship for antigravity, claude and qwen only, each with its error fallback and deny exit code', () => {
    const runtimes = fs.readdirSync(PLATFORMS_DIR)
      .filter((name) => fs.existsSync(path.join(PLATFORMS_DIR, name, 'hook-adapter.js')));
    assert.deepEqual(runtimes.sort(), Object.keys(ADAPTERS));
    assert.deepEqual(Object.values(ADAPTERS).map((adapter) => [adapter.errorFallback, adapter.denyExitCode]), [
      [{}, undefined],
      [{ continue: false, decision: 'block' }, undefined],
      [{ continue: true, decision: 'allow' }, 2],
    ]);
  });

  for (const [runtime, name, raw, ctx] of INPUTS) {
    it(`${runtime} normalizeInput ${name}`, () => assert.deepEqual(ADAPTERS[runtime].normalizeInput(raw), ctx));
  }

  for (const [runtime, name, result, out] of OUTPUTS) {
    it(`${runtime} formatOutput ${name}`, () => assert.deepEqual(ADAPTERS[runtime].formatOutput(result), out));
  }
});
