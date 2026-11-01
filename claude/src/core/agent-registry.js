'use strict';

const { toSnakeCase, escapeRegExp } = require('../lib/naming');
const agentRegistryData = require('../generated/agent-registry.json');

/** Canonical kebab-case agent names, in registry order. */
const AGENT_NAMES = Object.freeze(agentRegistryData.map((entry) => entry.name));

/** The same names in snake_case. */
const KNOWN_AGENTS = Object.freeze(AGENT_NAMES.map((name) => toSnakeCase(name)));

const AGENT_CAPABILITIES = Object.freeze(
  Object.fromEntries(
    agentRegistryData.map((entry) => [toSnakeCase(entry.name), entry.capabilities])
  )
);

function normalizeAgentName(name) {
  if (typeof name !== 'string') return '';
  return toSnakeCase(name.toLowerCase());
}

function knownAgent(name) {
  const normalized = normalizeAgentName(name);
  return KNOWN_AGENTS.includes(normalized) ? normalized : '';
}

const AGENT_HEADER_PATTERN = /(?:^|\n)\s*agent:\s*([a-z0-9_-]+)/i;

// A delegation verb or an @-mention before the agent name, kebab or snake.
const AGENT_PATTERNS = KNOWN_AGENTS.map((agent) => ({
  agent,
  pattern: new RegExp('(?:(?:delegate|transfer|hand\\s*off|dispatch|invoke)\\s+(?:to\\s+)?(?:the\\s+)?|@)' +
    `${escapeRegExp(agent).replace(/_/g, '[-_]')}\\b`),
}));

function detectAgentFromPrompt(prompt) {
  const header = typeof prompt === 'string' ? prompt.match(AGENT_HEADER_PATTERN)?.[1] : '';
  const known = knownAgent(header) || knownAgent(process.env.MAESTRO_CURRENT_AGENT);
  if (known || !prompt) return known;
  const lower = prompt.toLowerCase();
  return AGENT_PATTERNS.find(({ pattern }) => pattern.test(lower))?.agent || '';
}

function getAgentCapability(name) {
  return AGENT_CAPABILITIES[normalizeAgentName(name)] || null;
}

module.exports = {
  AGENT_NAMES, KNOWN_AGENTS, AGENT_CAPABILITIES, normalizeAgentName, detectAgentFromPrompt, getAgentCapability,
};
