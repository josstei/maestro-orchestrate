'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const claudeAdapter = require('../../src/platforms/shared/adapters/claude-adapter');
const geminiAdapter = require('../../src/platforms/shared/adapters/gemini-adapter');
const qwenAdapter = require('../../src/platforms/shared/adapters/qwen-adapter');

describe('claude-adapter', () => {
  describe('normalizeInput', () => {
    it('maps session_id, cwd, and hook_event_name', () => {
      const raw = {
        session_id: 'abc-123',
        cwd: '/home/user/project',
        hook_event_name: 'PreToolUse',
      };

      const result = claudeAdapter.normalizeInput(raw);

      assert.equal(result.sessionId, 'abc-123');
      assert.equal(result.cwd, '/home/user/project');
      assert.equal(result.event, 'PreToolUse');
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
      assert.equal(result.event, '');
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
    it('returns 0 for allow results', () => {
      assert.equal(claudeAdapter.getExitCode({ action: 'allow' }), 0);
    });

    it('returns 0 for deny results', () => {
      assert.equal(claudeAdapter.getExitCode({ action: 'deny' }), 0);
    });
  });
});

describe('gemini-adapter', () => {
  describe('normalizeInput', () => {
    it('maps session_id, cwd, and hook_event_name', () => {
      const raw = {
        session_id: 'xyz-789',
        cwd: '/workspace/app',
        hook_event_name: 'BeforeAgent',
      };

      const result = geminiAdapter.normalizeInput(raw);

      assert.equal(result.sessionId, 'xyz-789');
      assert.equal(result.cwd, '/workspace/app');
      assert.equal(result.event, 'BeforeAgent');
    });

    it('maps prompt to agentInput and prompt_response to agentResult', () => {
      const raw = {
        prompt: 'Write the implementation.',
        prompt_response: 'Here is the implementation.',
      };

      const result = geminiAdapter.normalizeInput(raw);

      assert.equal(result.agentInput, 'Write the implementation.');
      assert.equal(result.agentResult, 'Here is the implementation.');
    });

    it('maps stop_hook_active boolean true to stopHookActive true', () => {
      const result = geminiAdapter.normalizeInput({ stop_hook_active: true });

      assert.equal(result.stopHookActive, true);
    });

    it('maps stop_hook_active string "true" to stopHookActive true', () => {
      const result = geminiAdapter.normalizeInput({ stop_hook_active: 'true' });

      assert.equal(result.stopHookActive, true);
    });

    it('sets agentName to null always', () => {
      const result = geminiAdapter.normalizeInput({ tool_input: { subagent_type: 'anything' } });

      assert.equal(result.agentName, null);
    });
  });

  describe('formatOutput', () => {
    it('maps deny action to { continue: false }', () => {
      const result = geminiAdapter.formatOutput({ action: 'deny' });

      assert.equal(result.continue, false);
    });

    it('maps allow action to { continue: true }', () => {
      const result = geminiAdapter.formatOutput({ action: 'allow' });

      assert.equal(result.continue, true);
    });

    it('includes systemMessage from result.message or result.reason', () => {
      const withMessage = geminiAdapter.formatOutput({ action: 'allow', message: 'OK.' });
      const withReason = geminiAdapter.formatOutput({ action: 'deny', reason: 'Not allowed.' });

      assert.equal(withMessage.systemMessage, 'OK.');
      assert.equal(withReason.systemMessage, 'Not allowed.');
    });
  });

  describe('errorFallback', () => {
    it('returns { continue: false }', () => {
      const result = geminiAdapter.errorFallback();

      assert.deepEqual(result, { continue: false });
    });
  });

  describe('getExitCode', () => {
    it('returns 0 for allow results', () => {
      assert.equal(geminiAdapter.getExitCode({ action: 'allow' }), 0);
    });

    it('returns 0 for deny results', () => {
      assert.equal(geminiAdapter.getExitCode({ action: 'deny' }), 0);
    });
  });
});

describe('qwen-adapter', () => {
  describe('normalizeInput', () => {
    it('maps session_id, cwd, and hook_event_name', () => {
      const raw = {
        session_id: 'qwen-123',
        cwd: '/workspace/app',
        hook_event_name: 'SubagentStart',
      };

      const result = qwenAdapter.normalizeInput(raw);

      assert.equal(result.sessionId, 'qwen-123');
      assert.equal(result.cwd, '/workspace/app');
      assert.equal(result.event, 'SubagentStart');
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
    it('returns block output', () => {
      const result = qwenAdapter.errorFallback();

      assert.deepEqual(result, {
        continue: false,
        decision: 'block',
        reason: 'Hook execution failed; blocking by default.',
      });
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
