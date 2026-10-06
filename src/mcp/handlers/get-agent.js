'use strict';

const { getDefaultRuntimeConfig } = require('../runtime/runtime-config-map');
const { AGENT_ALLOWLIST, readAgentFromFilesystem } = require('../content/runtime-content');
const { resolveCanonicalSrcFromExtensionRoot } = require('../utils/extension-root');
const { ValidationError } = require('../../lib/errors');
const { toSnakeCase, toKebabCase } = require('../../lib/naming');

function createHandler(runtimeConfig = getDefaultRuntimeConfig(), canonicalSrcRoot) {
  return function handleGetAgent(params) {
    const requestedAgents = params.agents;
    if (!Array.isArray(requestedAgents) || requestedAgents.length === 0) {
      throw new ValidationError('agents must be a non-empty array of agent identifiers');
    }

    const srcRoot =
      canonicalSrcRoot === undefined ? resolveCanonicalSrcFromExtensionRoot() : canonicalSrcRoot;
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

      const toolName =
        runtimeConfig.agentNaming === 'snake_case'
          ? toSnakeCase(canonicalName)
          : canonicalName;

      agents[inputName] = { ...result.agent, tool_name: toolName };
    }

    return { agents, errors };
  };
}

module.exports = {
  createHandler,
};
