'use strict';

/**
 * Antigravity hook I/O adapter (field mappings: docs/runtime-antigravity.md#hook-adapter).
 * Maestro registers only SessionStart hooks, which Antigravity fires for the
 * main conversation and again for every subagent conversation; the camelCase
 * payload names no agent. stdout is parsed strictly, so the runner prints only
 * the formatted object and exits 0.
 */

function normalizeInput(raw) {
  const workspacePaths = Array.isArray(raw.workspacePaths) ? raw.workspacePaths : [];

  return {
    sessionId: raw.conversationId || '',
    cwd: workspacePaths.find((p) => typeof p === 'string' && p) || '',
    agentName: null,
    agentInput: null,
    agentResult: null,
    stopHookActive: false,
  };
}

function formatOutput(result) {
  return result.message ? { injectSteps: [{ systemMessage: { systemMessage: result.message } }] } : {};
}

/**
 * PreToolUse shell policy on run_command (shared/policy-enforcer.js), reading
 * toolCall.args.CommandLine. Antigravity has no "no opinion" decision, so an `allow`
 * result becomes the host's `ask`, which leaves the user's own permission settings
 * in charge. See docs/runtime-antigravity.md#policies.
 */
const shellPolicy = {
  tool: 'run_command',
  readCommand: (input) => input.toolCall && input.toolCall.args && input.toolCall.args.CommandLine,
  decisions: { deny: 'deny', ask: 'force_ask', allow: 'ask' },
};

module.exports = { normalizeInput, formatOutput, errorFallback: {}, shellPolicy };
