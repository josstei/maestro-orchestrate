'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const antigravityAdapter = require('../../src/platforms/antigravity/hook-adapter');
const claudeAdapter = require('../../src/platforms/claude/hook-adapter');
const qwenAdapter = require('../../src/platforms/qwen/hook-adapter');
const { SRC_ROOT } = require('../support/paths');

const PLATFORMS_DIR = path.join(SRC_ROOT, 'platforms');
const ADAPTER_RUNTIMES = fs.readdirSync(PLATFORMS_DIR)
  .filter((name) => fs.existsSync(path.join(PLATFORMS_DIR, name, 'hook-adapter.js')))
  .sort();

describe('hook adapter contract', () => {
  it('ships hook adapters for antigravity, claude and qwen only', () => {
    assert.deepEqual(ADAPTER_RUNTIMES, ['antigravity', 'claude', 'qwen']);
  });

  for (const runtime of ADAPTER_RUNTIMES) {
    it(`${runtime} exports normalizeInput, formatOutput and errorFallback`, () => {
      const adapter = require(path.join(PLATFORMS_DIR, runtime, 'hook-adapter.js'));
      for (const fn of ['normalizeInput', 'formatOutput', 'errorFallback']) {
        assert.equal(typeof adapter[fn], 'function', `${runtime} adapter must export ${fn}`);
      }
    });
  }
});

describe('antigravity hook-adapter', () => {
  describe('normalizeInput', () => {
    it('maps conversationId to sessionId and the first workspace path to cwd', () => {
      const raw = {
        conversationId: '6f1c2d3e-0000-4000-8000-000000000001',
        workspacePaths: ['/workspace/app', '/workspace/lib'],
        transcriptPath: '/tmp/conversation/transcript.jsonl',
        artifactDirectoryPath: '/tmp/conversation/artifacts',
        modelName: 'example-model',
      };

      const result = antigravityAdapter.normalizeInput(raw);

      assert.equal(result.sessionId, '6f1c2d3e-0000-4000-8000-000000000001');
      assert.equal(result.cwd, '/workspace/app');
    });

    it('skips empty and non-string workspace paths', () => {
      const result = antigravityAdapter.normalizeInput({ workspacePaths: ['', null, 7, '/workspace/app'] });

      assert.equal(result.cwd, '/workspace/app');
    });

    it('leaves the agent fields null because the payload names no agent', () => {
      const result = antigravityAdapter.normalizeInput({
        conversationId: 'conv-1',
        workspacePaths: ['/workspace/app'],
      });

      assert.equal(result.agentName, null);
      assert.equal(result.agentInput, null);
      assert.equal(result.agentResult, null);
      assert.equal(result.stopHookActive, false);
    });

    it('handles missing fields and a non-array workspacePaths with empty-string defaults', () => {
      for (const raw of [{}, { workspacePaths: '/workspace/app' }]) {
        const result = antigravityAdapter.normalizeInput(raw);

        assert.equal(result.sessionId, '');
        assert.equal(result.cwd, '');
      }
    });
  });

  describe('formatOutput', () => {
    it('returns {} when there is no message', () => {
      assert.deepEqual(antigravityAdapter.formatOutput({ action: 'advisory', message: null, reason: null }), {});
      assert.deepEqual(antigravityAdapter.formatOutput({ action: 'allow', message: null, reason: null }), {});
    });

    it('injects the message as a system message step', () => {
      const result = antigravityAdapter.formatOutput({
        action: 'allow',
        message: 'Active session: current_phase=2, status=in_progress',
        reason: null,
      });

      assert.deepEqual(result, {
        injectSteps: [{ systemMessage: { systemMessage: 'Active session: current_phase=2, status=in_progress' } }],
      });
    });
  });

  describe('errorFallback', () => {
    it('returns {}', () => {
      assert.deepEqual(antigravityAdapter.errorFallback(), {});
    });
  });

  describe('getExitCode', () => {
    it('is not defined, so the hook runner always exits 0', () => {
      assert.equal(antigravityAdapter.getExitCode, undefined);
    });
  });
});

describe('claude hook-adapter', () => {
  describe('normalizeInput', () => {
    it('maps session_id and cwd', () => {
      const raw = {
        session_id: 'abc-123',
        cwd: '/home/user/project',
        hook_event_name: 'PreToolUse',
      };

      const result = claudeAdapter.normalizeInput(raw);

      assert.equal(result.sessionId, 'abc-123');
      assert.equal(result.cwd, '/home/user/project');
    });

    it('maps tool_input.subagent_type to agentName and tool_input.prompt to agentInput', () => {
      const raw = {
        tool_input: {
          subagent_type: 'maestro:coder',
          prompt: 'Implement the feature.',
        },
      };

      const result = claudeAdapter.normalizeInput(raw);

      assert.equal(result.agentName, 'maestro:coder');
      assert.equal(result.agentInput, 'Implement the feature.');
    });

    it('maps tool_result to agentResult', () => {
      const raw = {
        tool_result: 'The agent returned this output.',
      };

      const result = claudeAdapter.normalizeInput(raw);

      assert.equal(result.agentResult, 'The agent returned this output.');
    });

    it('always sets stopHookActive to false', () => {
      const result = claudeAdapter.normalizeInput({ stop_hook_active: true });

      assert.equal(result.stopHookActive, false);
    });

    it('handles missing fields with defaults of empty string or null', () => {
      const result = claudeAdapter.normalizeInput({});

      assert.equal(result.sessionId, '');
      assert.equal(result.cwd, '');
      assert.equal(result.agentName, null);
      assert.equal(result.agentInput, null);
      assert.equal(result.agentResult, null);
    });
  });

  describe('formatOutput', () => {
    it('maps deny action to { continue: false, decision: "block" }', () => {
      const result = claudeAdapter.formatOutput({ action: 'deny', reason: 'Blocked.' });

      assert.equal(result.continue, false);
      assert.equal(result.decision, 'block');
    });

    it('maps allow action to { continue: true, decision: "approve" }', () => {
      const result = claudeAdapter.formatOutput({ action: 'allow' });

      assert.equal(result.continue, true);
      assert.equal(result.decision, 'approve');
    });

    it('includes systemMessage from result.message when present', () => {
      const result = claudeAdapter.formatOutput({ action: 'allow', message: 'All good.' });

      assert.equal(result.systemMessage, 'All good.');
    });

    it('falls back to result.reason for systemMessage when message is absent', () => {
      const result = claudeAdapter.formatOutput({ action: 'deny', reason: 'Policy violation.' });

      assert.equal(result.systemMessage, 'Policy violation.');
    });
  });

  describe('errorFallback', () => {
    it('returns { continue: false, decision: "block" }', () => {
      const result = claudeAdapter.errorFallback();

      assert.deepEqual(result, { continue: false, decision: 'block' });
    });
  });

  describe('getExitCode', () => {
    it('is not defined, so the hook runner exits 0 for allow and deny results', () => {
      assert.equal(claudeAdapter.getExitCode, undefined);
    });
  });
});

describe('qwen hook-adapter', () => {
  describe('normalizeInput', () => {
    it('maps session_id and cwd', () => {
      const raw = {
        session_id: 'qwen-123',
        cwd: '/workspace/app',
        hook_event_name: 'SubagentStart',
      };

      const result = qwenAdapter.normalizeInput(raw);

      assert.equal(result.sessionId, 'qwen-123');
      assert.equal(result.cwd, '/workspace/app');
    });

    it('maps agent_type to agentName and leaves agentInput null for SubagentStart', () => {
      const result = qwenAdapter.normalizeInput({
        hook_event_name: 'SubagentStart',
        agent_type: 'coder',
      });

      assert.equal(result.agentName, 'coder');
      assert.equal(result.agentInput, null);
      assert.equal(result.agentResult, null);
    });

    it('maps last_assistant_message to agentResult for SubagentStop', () => {
      const result = qwenAdapter.normalizeInput({
        hook_event_name: 'SubagentStop',
        agent_type: 'coder',
        last_assistant_message: '## Task Report\nDone.\n\n## Downstream Context\nNext steps.',
      });

      assert.equal(result.agentName, 'coder');
      assert.equal(result.agentInput, null);
      assert.equal(result.agentResult, '## Task Report\nDone.\n\n## Downstream Context\nNext steps.');
    });

    it('maps stop_hook_active boolean true to stopHookActive true', () => {
      const result = qwenAdapter.normalizeInput({ stop_hook_active: true });

      assert.equal(result.stopHookActive, true);
    });

    it('maps stop_hook_active string "true" to stopHookActive true', () => {
      const result = qwenAdapter.normalizeInput({ stop_hook_active: 'true' });

      assert.equal(result.stopHookActive, true);
    });
  });

  describe('formatOutput', () => {
    it('maps deny action to block output', () => {
      const result = qwenAdapter.formatOutput({ action: 'deny', reason: 'Blocked.' });

      assert.equal(result.continue, false);
      assert.equal(result.decision, 'block');
      assert.equal(result.reason, 'Blocked.');
    });

    it('stores message in hookSpecificOutput.additionalContext', () => {
      const result = qwenAdapter.formatOutput({ action: 'allow', message: 'Context.' });

      assert.deepEqual(result.hookSpecificOutput, { additionalContext: 'Context.' });
    });
  });

  describe('errorFallback', () => {
    it('returns { continue: true, decision: "allow" }', () => {
      const result = qwenAdapter.errorFallback();

      assert.deepEqual(result, { continue: true, decision: 'allow' });
    });
  });

  describe('getExitCode', () => {
    it('returns 0 for allow results', () => {
      assert.equal(qwenAdapter.getExitCode({ action: 'allow' }), 0);
    });

    it('returns 2 for deny results', () => {
      assert.equal(qwenAdapter.getExitCode({ action: 'deny' }), 2);
    });
  });
});
