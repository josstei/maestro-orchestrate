'use strict';

/**
 * Antigravity hook I/O adapter.
 * Normalizes Antigravity stdin JSON to the internal context contract
 * and formats internal responses for Antigravity stdout.
 *
 * Maestro registers only SessionStart hooks through the hook runner (see
 * antigravity/hooks.json). Antigravity fires SessionStart for the main
 * conversation and again for every subagent conversation, so a context
 * message reaches each delegated agent when it starts. Antigravity has no
 * SessionEnd, SubagentStart or SubagentStop event.
 *
 * Input (camelCase protojson): conversationId, workspacePaths[], transcriptPath,
 * artifactDirectoryPath, modelName. The payload carries no agent name.
 *
 * Output: {} or { injectSteps: [{ systemMessage: { systemMessage } }] }. stdout
 * is parsed strictly, so nothing else may be emitted, and the exit code stays 0.
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
  if (!result.message) {
    return {};
  }

  return { injectSteps: [{ systemMessage: { systemMessage: result.message } }] };
}

function errorFallback() {
  return {};
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

module.exports = { normalizeInput, formatOutput, errorFallback, shellPolicy };
