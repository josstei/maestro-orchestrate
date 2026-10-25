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
 * The PreToolUse shell-policy hook on run_command, run by
 * src/platforms/shared/policy-enforcer.js, checks toolCall.args.CommandLine.
 *
 * Antigravity denies the tool call when a PreToolUse hook fails or prints
 * anything but a known decision, and has no "no opinion" decision, so:
 *   - a deny rule match is `deny` (blocks in every permission mode)
 *   - an ask rule match is `force_ask` (prompts even when the user's
 *     permissions.allow covers the command)
 *   - any other command is `ask`, which leaves the user's permission settings
 *     and "Always Allow" choices in charge, exactly as without this hook
 */
const shellPolicy = {
  tool: 'run_command',
  readCommand: (input) => input.toolCall && input.toolCall.args && input.toolCall.args.CommandLine,
  decisions: { deny: 'deny', ask: 'force_ask', allow: 'ask' },
};

module.exports = { normalizeInput, formatOutput, errorFallback, shellPolicy };
