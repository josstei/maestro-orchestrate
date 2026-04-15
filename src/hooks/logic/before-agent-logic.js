'use strict';

const { log } = require('../../core/logger');
const { detectAgentFromPrompt, normalizeAgentName } = require('../../core/agent-registry');
const { assertSessionId } = require('../../lib/validation');
const { readFileSafe } = require('../../lib/io');
const hookState = require('./hook-state');
const state = require('../../state/session-state');

/**
 * Before-agent hook logic (runtime-agnostic).
 *
 * Field name mapping: the Gemini adapter maps ctx.prompt → ctx.agentInput
 * before calling this function.
 *
 * @param {object} ctx - Internal context contract
 * @param {string} ctx.sessionId
 * @param {string} ctx.cwd
 * @param {string|null} ctx.agentInput  - the agent prompt text
 * @param {string} [ctx.event]          - hook event name (used in context message)
 * @returns {{ action: string, message: string|null, reason: null }}
 */
function handleBeforeAgent(ctx) {
  hookState.pruneStale();

  const agentName = detectAgentFromPrompt(ctx.agentInput) || normalizeAgentName(ctx.agentName);

  let validSession = false;
  try { assertSessionId(ctx.sessionId); validSession = true; } catch (_) {}

  if (agentName && validSession) {
    hookState.setActiveAgent(ctx.sessionId, agentName);
    log('INFO', `BeforeAgent: Detected agent '${agentName}' — set active agent [session=${ctx.sessionId}]`);
  }

  const sessionPath = state.resolveActiveSessionPath(ctx.cwd);
  let contextParts = '';

  const content = readFileSafe(sessionPath, '');
  if (content) {
    const parts = [];
    const phaseMatch = content.match(/current_phase:\s*(\S+)/);
    if (phaseMatch) parts.push(`current_phase=${phaseMatch[1]}`);
    const statusMatch = content.match(/status:\s*(\S+)/);
    if (statusMatch) parts.push(`status=${statusMatch[1]}`);
    if (parts.length > 0) {
      contextParts = `Active session: ${parts.join(', ')}`;
    }
  }

  if (contextParts) {
    return { action: 'allow', message: contextParts, reason: null };
  }
  return { action: 'allow', message: null, reason: null };
}

module.exports = { handleBeforeAgent };
