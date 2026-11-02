'use strict';

/**
 * Qwen Code hook I/O adapter. Each lifecycle event has its own payload:
 *   - SessionStart:  common + permission_mode, source, model
 *   - SessionEnd:    common + reason
 *   - SubagentStart: common + agent_id, agent_type, permission_mode
 *   - SubagentStop:  common + agent_id, agent_type, stop_hook_active, last_assistant_message
 * PreToolUse is permission-oriented (permissionDecision output) and not handled here.
 * A deny exits 2, Qwen Code's blocking exit code.
 */

function normalizeInput(raw) {
  const event = raw.hook_event_name || '';

  return {
    sessionId: raw.session_id || '',
    cwd: raw.cwd || '',
    agentName: raw.agent_type || null,
    agentInput: null,
    agentResult: event === 'SubagentStop'
      ? (raw.last_assistant_message || '')
      : null,
    stopHookActive: raw.stop_hook_active === true || raw.stop_hook_active === 'true',
  };
}

// Hook logic sets a reason only on deny (after-agent's handoff check).
function formatOutput(result) {
  const out = result.action === 'deny' ? { continue: false, decision: 'block', reason: result.reason } : {};
  if (result.message) out.hookSpecificOutput = { additionalContext: result.message };
  return out;
}

module.exports = {
  normalizeInput,
  formatOutput,
  errorFallback: { continue: true, decision: 'allow' },
  denyExitCode: 2,
};
