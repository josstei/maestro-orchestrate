'use strict';

const { AGENT_ALLOWLIST, readAgentFromFilesystem } = require('../content/runtime-content');
const { ValidationError } = require('../../lib/errors');
const { toKebabCase, toNamingConvention } = require('../../lib/naming');

function createHandler(runtimeConfig, srcRoot) {
  return function handleGetAgent(params) {
    const requestedAgents = params.agents;
    if (!Array.isArray(requestedAgents) || requestedAgents.length === 0) {
      throw new ValidationError('agents must be a non-empty array of agent identifiers');
    }

    const agents = {};
    const errors = {};

    for (const rawName of requestedAgents) {
      const inputName = String(rawName || '').trim();
      const canonicalName = toKebabCase(inputName);

      if (!AGENT_ALLOWLIST.includes(canonicalName)) {
        errors[inputName || '(empty)'] =
          `Unknown agent identifier: "${inputName}". Known identifiers: ${AGENT_ALLOWLIST.join(', ')}`;
        continue;
      }

      const result = readAgentFromFilesystem(canonicalName, runtimeConfig, srcRoot);
      if (result.error) {
        errors[inputName] = result.error;
        continue;
      }

      agents[inputName] = {
        ...result.agent,
        tool_name: toNamingConvention(canonicalName, runtimeConfig.agentNaming),
      };
    }

    return { agents, errors };
  };
}

module.exports = {
  createHandler,
};
