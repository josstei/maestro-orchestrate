'use strict';

const { AGENT_NAMES, KNOWN_AGENTS, AGENT_CAPABILITIES } = require('../../core/agent-registry');

function createHandler(runtimeConfig, getWorkspaceSuggestion = () => null) {
  const agentNames = runtimeConfig.agentNaming === 'snake_case' ? KNOWN_AGENTS : AGENT_NAMES;

  const delegation = runtimeConfig.delegation || {};
  const pattern = delegation.pattern || '';

  return function handleGetRuntimeContext(_params) {
    return {
      runtime: runtimeConfig.name,
      tools: runtimeConfig.tools || {},
      agent_dispatch: {
        pattern,
        naming: runtimeConfig.agentNaming || 'kebab-case',
        prefix: runtimeConfig.agentPrefix || '',
      },
      delegation: {
        pattern,
        constraints: delegation.constraints || {},
      },
      mcp_prefix: runtimeConfig.mcpPrefix || '',
      paths: runtimeConfig.paths || {},
      agents: agentNames,
      agent_capabilities: AGENT_CAPABILITIES,
      plan_mode_native: runtimeConfig.planModeNative === true,
      workspace_suggestion: getWorkspaceSuggestion() || null,
    };
  };
}

module.exports = { createHandler };
