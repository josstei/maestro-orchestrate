'use strict';

const { AGENT_NAMES, KNOWN_AGENTS, AGENT_CAPABILITIES } = require('../../core/agent-registry');

function handleGetRuntimeContext(_params, _projectRoot, { runtimeConfig, workspace }) {
  const { delegation } = runtimeConfig;

  return {
    runtime: runtimeConfig.name,
    tools: runtimeConfig.tools,
    agent_dispatch: {
      pattern: delegation.pattern,
      naming: runtimeConfig.agentNaming,
      // Only Claude namespaces its agents.
      prefix: runtimeConfig.agentPrefix || '',
    },
    delegation: {
      pattern: delegation.pattern,
      constraints: delegation.constraints,
    },
    mcp_prefix: runtimeConfig.mcpPrefix,
    paths: runtimeConfig.paths,
    agents: runtimeConfig.agentNaming === 'snake_case' ? KNOWN_AGENTS : AGENT_NAMES,
    agent_capabilities: AGENT_CAPABILITIES,
    plan_mode_native: runtimeConfig.planModeNative,
    workspace_suggestion: workspace.workspaceSuggestion(runtimeConfig.env.workspacePath),
  };
}

module.exports = { handleGetRuntimeContext };
