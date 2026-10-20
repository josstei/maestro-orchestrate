'use strict';

const { log } = require('../../core/logger');
const { AGENT_NAMES, normalizeAgentName, getAgentCapability } = require('../../core/agent-registry');
const { readFileSafe } = require('../../lib/io');
const { resolveHookWorkspaceRoot } = require('../../core/project-root-resolver');
const hookState = require('./hook-state');
const state = require('../../state/session-state');

const AGENT_HEADER_PATTERN = /(?:^|\n)\s*agent:\s*([a-z0-9_-]+)/i;

// Delegation phrases and @mentions per agent, in registry order; kebab and snake case both
// match. Agent names are lowercase [a-z0-9-] (pinned by the registry tests), so they need no escaping.
const AGENT_PATTERNS = AGENT_NAMES.map((name) => {
  const alias = name.replace(/-/g, '[-_]');
  return {
    agent: normalizeAgentName(name),
    patterns: [
      new RegExp(`(?:delegate|transfer|hand\\s*off|dispatch|invoke)\\s+(?:to\\s+)?(?:the\\s+)?${alias}\\b`),
      new RegExp(`@${alias}\\b`),
    ],
  };
});

/** The normalized name when it names a registered agent, else ''. */
function knownAgent(name) {
  const normalized = normalizeAgentName(name);
  return getAgentCapability(normalized) !== null ? normalized : '';
}

/**
 * The agent a delegation is for: the prompt's `agent:` header, then
 * MAESTRO_CURRENT_AGENT, then the first agent the prompt delegates to or
 * @mentions. '' when none names a registered agent.
 * @param {string|null} prompt
 * @returns {string} snake_case agent name or ''
 */
function detectAgentFromPrompt(prompt) {
  if (typeof prompt === 'string') {
    const headerAgent = knownAgent(prompt.match(AGENT_HEADER_PATTERN)?.[1]);
    if (headerAgent) return headerAgent;
  }

  const envAgent = knownAgent(process.env.MAESTRO_CURRENT_AGENT);
  if (envAgent) return envAgent;

  if (!prompt) return '';

  const lower = prompt.toLowerCase();
  for (const { agent, patterns } of AGENT_PATTERNS) {
    if (patterns.some((p) => p.test(lower))) {
      return agent;
    }
  }

  return '';
}

/**
 * Builds the `key=value` context parts from active-session.md. Sessions created
 * through MCP use JSON frontmatter; legacy hand-written files use YAML-style lines.
 * @param {string} content
 * @returns {string[]}
 */
function summarizeSession(content) {
  try {
    const { data } = state.parseSessionFile(content);
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
 * Reads the active session summary for the workspace containing `cwd` (see
 * resolveHookWorkspaceRoot). A state-dir resolution error yields no context
 * rather than failing the hook (which would block the agent).
 * @param {string|undefined} cwd
 * @returns {string[]}
 */
function readSessionSummary(cwd) {
  let content;
  try {
    const root = resolveHookWorkspaceRoot(cwd);
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
 * Field name mapping: each runtime's hook adapter
 * (src/platforms/<runtime>/hook-adapter.js) fills ctx.agentInput and/or
 * ctx.agentName from its host payload before calling this function (Claude:
 * tool_input.prompt and tool_input.subagent_type; Qwen: agent_type only;
 * Antigravity, which runs it at SessionStart: neither, so only the session
 * context line is produced).
 *
 * @param {object} ctx - Internal context contract
 * @param {string} ctx.sessionId
 * @param {string} ctx.cwd
 * @param {string|null} ctx.agentInput  - the agent prompt text
 * @param {string|null} ctx.agentName   - the dispatched agent's name
 * @returns {{ action: string, message: string|null, reason: null }}
 */
function handleBeforeAgent(ctx) {
  hookState.pruneStale();

  const agentName = detectAgentFromPrompt(ctx.agentInput) || normalizeAgentName(ctx.agentName);

  if (agentName && hookState.setActiveAgent(ctx.sessionId, agentName)) {
    log('INFO', `BeforeAgent: Detected agent '${agentName}' — set active agent [session=${ctx.sessionId}]`);
  }

  const parts = readSessionSummary(ctx.cwd);
  const message = parts.length > 0 ? `Active session: ${parts.join(', ')}` : null;
  return { action: 'allow', message, reason: null };
}

module.exports = { handleBeforeAgent };
