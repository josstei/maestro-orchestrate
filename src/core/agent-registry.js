'use strict';

const { toSnakeCase, escapeRegExp } = require('../lib/naming');
const agentRegistryData = require('../generated/agent-registry.json');

const KNOWN_AGENTS = Object.freeze(
  agentRegistryData.map((entry) => toSnakeCase(entry.name))
);

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

const AGENT_PATTERNS = KNOWN_AGENTS.map((agent) => {
  const aliasPattern = escapeRegExp(agent).replace(/_/g, '[-_]');
  return {
    agent,
    patterns: [
      new RegExp(`(?:delegate|transfer|hand\\s*off|dispatch|invoke)\\s+(?:to\\s+)?(?:the\\s+)?${aliasPattern}\\b`),
      new RegExp(`@${aliasPattern}\\b`),
    ],
  };
});

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

function getAgentCapability(name) {
  const normalized = normalizeAgentName(name);
  return AGENT_CAPABILITIES[normalized] || null;
}

function canCreateFiles(name) {
  const cap = getAgentCapability(name);
  return cap === 'read_write' || cap === 'full';
}

module.exports = { KNOWN_AGENTS, AGENT_CAPABILITIES, normalizeAgentName, detectAgentFromPrompt, getAgentCapability, canCreateFiles };
