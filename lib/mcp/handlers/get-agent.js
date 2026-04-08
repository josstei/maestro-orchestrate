'use strict';

const { DEFAULT_RUNTIME_CONFIG, DEFAULT_SRC_RELATIVE_PATH } = require('./get-skill-content');
const { AGENT_ALLOWLIST } = require('../content/runtime-content');
const { createContentProvider } = require('../content/provider');

function createHandler(
  runtimeConfig = DEFAULT_RUNTIME_CONFIG,
  srcRelativePath = DEFAULT_SRC_RELATIVE_PATH
) {
  return function handleGetAgent(params) {
    const requestedAgents = params.agents;
    if (!Array.isArray(requestedAgents) || requestedAgents.length === 0) {
      throw new Error('agents must be a non-empty array of kebab-case agent identifiers');
    }

    const provider = createContentProvider(runtimeConfig, srcRelativePath);
    const agents = {};
    const errors = {};

    for (const rawName of requestedAgents) {
      const agentName = String(rawName || '').trim();
      if (!AGENT_ALLOWLIST.includes(agentName)) {
        errors[agentName || '(empty)'] =
          `Unknown agent identifier: "${agentName}". Known identifiers: ${AGENT_ALLOWLIST.join(', ')}`;
        continue;
      }

      const result = provider.readAgent(agentName);
      if (result.error) {
        errors[agentName] = result.error;
        continue;
      }

      agents[agentName] = result.agent;
    }

    return { agents, errors };
  };
}

const handleGetAgent = createHandler();

module.exports = {
  AGENT_ALLOWLIST,
  createHandler,
  handleGetAgent,
};
