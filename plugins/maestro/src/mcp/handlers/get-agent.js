'use strict';

const { DEFAULT_RUNTIME_CONFIG } = require('./get-skill-content');
const { AGENT_ALLOWLIST } = require('../content/runtime-content');
const { createContentProvider } = require('../content/provider');
const { ValidationError } = require('../../lib/errors');
const { toSnakeCase, toKebabCase } = require('../../lib/naming');

function createHandler(runtimeConfig = DEFAULT_RUNTIME_CONFIG, canonicalSrcRoot) {
  return function handleGetAgent(params) {
    const requestedAgents = params.agents;
    if (!Array.isArray(requestedAgents) || requestedAgents.length === 0) {
      throw new ValidationError('agents must be a non-empty array of agent identifiers');
    }

    const provider = createContentProvider(runtimeConfig, canonicalSrcRoot);
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

      const result = provider.readAgent(canonicalName);
      if (result.error) {
        errors[inputName] = result.error;
        continue;
      }

      const toolName =
        runtimeConfig.agentNaming === 'snake_case'
          ? toSnakeCase(canonicalName)
          : canonicalName;

      agents[inputName] = { ...result.agent, tool_name: toolName };
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
