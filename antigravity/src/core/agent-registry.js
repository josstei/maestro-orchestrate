'use strict';

const { toSnakeCase } = require('../lib/naming');
const agentRegistryData = require('../generated/agent-registry.json');

/** Canonical kebab-case agent names, in registry order. */
const AGENT_NAMES = Object.freeze(agentRegistryData.map((entry) => entry.name));

/** Tool tier per agent, keyed by the snake_case name normalizeAgentName produces. */
const AGENT_CAPABILITIES = Object.freeze(
  Object.fromEntries(
    agentRegistryData.map((entry) => [toSnakeCase(entry.name), entry.capabilities])
  )
);

function normalizeAgentName(name) {
  if (typeof name !== 'string') return '';
  return toSnakeCase(name.toLowerCase());
}

/**
 * The tool tier of an agent named in either case, or null for a name that is
 * not a registered agent.
 * @param {unknown} name
 * @returns {string|null}
 */
function getAgentCapability(name) {
  const normalized = normalizeAgentName(name);
  return Object.hasOwn(AGENT_CAPABILITIES, normalized) ? AGENT_CAPABILITIES[normalized] : null;
}

module.exports = { AGENT_NAMES, AGENT_CAPABILITIES, normalizeAgentName, getAgentCapability };
