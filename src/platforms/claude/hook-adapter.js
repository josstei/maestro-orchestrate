'use strict';

/**
 * Claude Code hook I/O adapter.
 * Normalizes Claude Code stdin JSON to the internal context contract
 * and formats internal responses for Claude Code stdout.
 *
 * Maestro registers session-start, before-agent (PreToolUse on Agent) and
 * session-end through this adapter (see claude/hooks/claude-hooks.json); there
 * is no after-agent hook.
 */

function normalizeInput(raw) {
  return {
    sessionId: raw.session_id || '',
    cwd: raw.cwd || '',
    agentName: raw.tool_input?.subagent_type || null,
    agentInput: raw.tool_input?.prompt || null,
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

const errorFallback = Object.freeze({ continue: false, decision: 'block' });

module.exports = { normalizeInput, formatOutput, errorFallback };
