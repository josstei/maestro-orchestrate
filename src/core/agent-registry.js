'use strict';

const { toSnakeCase } = require('../lib/naming');
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

function detectAgentFromPrompt(prompt) {
  return typeof prompt === 'string' ? knownAgent(prompt.match(AGENT_HEADER_PATTERN)?.[1]) : '';
}

function getAgentCapability(name) {
  return AGENT_CAPABILITIES[normalizeAgentName(name)] || null;
}

module.exports = {
  AGENT_NAMES, KNOWN_AGENTS, AGENT_CAPABILITIES, normalizeAgentName, detectAgentFromPrompt, getAgentCapability,
};
