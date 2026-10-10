'use strict';

const { log } = require('../../core/logger');
const { detectAgentFromPrompt, normalizeAgentName } = require('../../core/agent-registry');
const { isValidSessionId } = require('../../lib/validation');
const { readFileSafe } = require('../../lib/io');
const markdownState = require('../../core/markdown-state');
const { resolveExistingRoot } = require('../../core/project-root-resolver');
const hookState = require('./hook-state');
const state = require('../../state/session-state');

/**
 * Builds the `key=value` context parts from active-session.md. Sessions created
 * through MCP use JSON frontmatter; legacy hand-written files use YAML-style lines.
 * @param {string} content
 * @returns {string[]}
 */
function summarizeSession(content) {
  try {
    const { data } = markdownState.parse(content);
    return [['current_phase', data.current_phase], ['status', data.status]]
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => `${key}=${value}`);
  } catch {
    const parts = [];
    const phaseMatch = content.match(/current_phase:\s*(\S+)/);
    if (phaseMatch) parts.push(`current_phase=${phaseMatch[1]}`);
    const statusMatch = content.match(/status:\s*(\S+)/);
    if (statusMatch) parts.push(`status=${statusMatch[1]}`);
    return parts;
  }
}

/**
 * Reads the active session summary for the workspace containing `cwd`. MCP anchors
 * session state at the git toplevel of the workspace, so a hook fired from a
 * subdirectory must resolve the same root. A state-dir resolution error yields no
 * context rather than failing the hook (which would block the agent).
 * @param {string|undefined} cwd
 * @returns {string[]}
 */
function readSessionSummary(cwd) {
  let content;
  try {
    const root = resolveExistingRoot(cwd || process.cwd()) || cwd;
    content = readFileSafe(state.resolveActiveSessionPath(root), '');
  } catch (err) {
    log('WARN', `BeforeAgent: could not resolve session state: ${err.message}`);
    return [];
  }
  return content ? summarizeSession(content) : [];
}

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
 * @returns {{ action: string, message: string|null, reason: null }}
 */
function handleBeforeAgent(ctx) {
  hookState.pruneStale();

  const agentName = detectAgentFromPrompt(ctx.agentInput) || normalizeAgentName(ctx.agentName);

  if (agentName && isValidSessionId(ctx.sessionId)) {
    hookState.setActiveAgent(ctx.sessionId, agentName);
    log('INFO', `BeforeAgent: Detected agent '${agentName}' — set active agent [session=${ctx.sessionId}]`);
  }

  const parts = readSessionSummary(ctx.cwd);
  const message = parts.length > 0 ? `Active session: ${parts.join(', ')}` : null;
  return { action: 'allow', message, reason: null };
}

module.exports = { handleBeforeAgent };
