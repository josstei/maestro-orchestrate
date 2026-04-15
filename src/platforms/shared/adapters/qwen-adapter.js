'use strict';

const { readBoundedJson } = require('../../../core/stdin-reader');

/**
 * Qwen Code hook I/O adapter.
 * Normalizes Qwen Code stdin JSON to the internal context contract
 * and formats internal responses for Qwen Code stdout.
 *
 * Each hook event has a distinct payload in Qwen. This adapter
 * normalizes to an internal contract and serializes per-event output.
 *
 * Event reference:
 *   - SessionStart:    session bootstrap (common + permission_mode, source, model)
 *   - SessionEnd:      session teardown (common + reason)
 *   - SubagentStart:   subagent lifecycle start (common + agent_id, agent_type, permission_mode)
 *   - SubagentStop:    subagent lifecycle end (common + agent_id, agent_type, stop_hook_active, last_assistant_message)
 *   - PreToolUse:      permission-oriented (uses permissionDecision output, not handled here)
 *
 * Internal contract fields:
 *   event, sessionId, cwd, transcriptPath, permissionMode,
 *   agentId, agentName, agentInput, agentResult, source, model, reason, stopHookActive
 *
 * Output contract (for non-permission hooks):
 *   { continue, decision, reason?, hookSpecificOutput?: { additionalContext } }
 */

function normalizeInput(raw) {
  const event = raw.hook_event_name || '';

  return {
    event,
    sessionId: raw.session_id || '',
    cwd: raw.cwd || '',
    transcriptPath: raw.transcript_path || '',
    permissionMode: raw.permission_mode || '',
    agentId: raw.agent_id || '',
    agentName: raw.agent_type || null,
    agentInput: null,
    agentResult: event === 'SubagentStop'
      ? (raw.last_assistant_message || '')
      : null,
    source: raw.source || '',
    model: raw.model || '',
    reason: raw.reason || '',
    stopHookActive: raw.stop_hook_active === true || raw.stop_hook_active === 'true',
  };
}

/**
 * Serialize internal result to Qwen-native output.
 *
 * Result from logic: { action: 'allow'|'deny', message: string|null, reason: string|null }
 *
 * For SessionStart, SubagentStart, SubagentStop, SessionEnd:
 *   standard output + optional hookSpecificOutput.additionalContext
 */
function formatOutput(result) {
  const isDeny = result.action === 'deny';
  const out = {};

  // Only emit decision/reason when explicitly controlling flow
  if (isDeny) {
    out.continue = false;
    out.decision = 'block';
    out.reason = result.reason || 'Blocked by hook';
  } else if (result.reason) {
    out.decision = 'allow';
    out.reason = result.reason;
  }

  if (result.message) {
    out.hookSpecificOutput = { additionalContext: result.message };
  }

  return out;
}

function errorFallback() {
  return { continue: true, decision: 'allow' };
}

module.exports = { normalizeInput, formatOutput, errorFallback, readBoundedStdin: readBoundedJson };
