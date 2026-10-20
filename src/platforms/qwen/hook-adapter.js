'use strict';

/**
 * Qwen Code hook I/O adapter.
 * Normalizes Qwen Code stdin JSON to the internal context contract
 * and formats internal responses for Qwen Code stdout.
 *
 * Maestro registers one hook per Qwen event (see qwen/hooks.json):
 *   - SessionStart:  session-start (common + permission_mode, source, model)
 *   - SubagentStart: before-agent  (common + agent_id, agent_type, permission_mode)
 *   - SubagentStop:  after-agent   (common + agent_id, agent_type, stop_hook_active, last_assistant_message)
 *   - SessionEnd:    session-end   (common + reason)
 *
 * Output: { continue?: false, decision?: 'block', reason?, hookSpecificOutput?: { additionalContext } };
 * a deny exits with code 2.
 */

function normalizeInput(raw) {
  return {
    sessionId: raw.session_id || '',
    cwd: raw.cwd || '',
    agentName: raw.agent_type || null,
    agentResult: raw.last_assistant_message,
    stopHookActive: raw.stop_hook_active === true || raw.stop_hook_active === 'true',
  };
}

function formatOutput(result) {
  const out = result.action === 'deny' ? { continue: false, decision: 'block', reason: result.reason } : {};
  if (result.message) {
    out.hookSpecificOutput = { additionalContext: result.message };
  }
  return out;
}

const errorFallback = Object.freeze({ continue: true, decision: 'allow' });

function getExitCode(result) {
  return result.action === 'deny' ? 2 : 0;
}

module.exports = {
  normalizeInput,
  formatOutput,
  errorFallback,
  getExitCode,
};
