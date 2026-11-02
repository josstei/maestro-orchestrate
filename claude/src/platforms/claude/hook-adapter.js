'use strict';

/** Claude Code hook I/O adapter (field mappings: docs/runtime-claude.md#hook-adapter). */

function normalizeInput(raw) {
  return {
    sessionId: raw.session_id || '',
    cwd: raw.cwd || '',
    agentName: raw.tool_input?.subagent_type || null,
    agentInput: raw.tool_input?.prompt || null,
    agentResult: raw.tool_result || null,
    stopHookActive: false,
  };
}

function formatOutput(result) {
  return {
    continue: result.action !== 'deny',
    systemMessage: result.message || result.reason || undefined,
    decision: result.action === 'deny' ? 'block' : 'approve',
    reason: result.reason || undefined,
  };
}

/** PreToolUse shell policy on Bash (shared/policy-enforcer.js): reads tool_input.command. */
const shellPolicy = {
  tool: 'Bash',
  readCommand: (input) => input.tool_input && input.tool_input.command,
  decisions: { deny: 'block', ask: 'ask', allow: 'approve' },
};

module.exports = { normalizeInput, formatOutput, errorFallback: { continue: false, decision: 'block' }, shellPolicy };
