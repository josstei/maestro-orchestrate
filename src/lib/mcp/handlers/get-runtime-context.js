'use strict';

const { KNOWN_AGENTS, AGENT_CAPABILITIES } = require('../../core/agent-registry');

const MCP_PREFIXES = {
  gemini: 'mcp_maestro_',
  claude: 'mcp__plugin_maestro_maestro__',
  codex: 'mcp__maestro_maestro__',
};

/**
 * Create a get_runtime_context handler bound to a specific runtime config.
 * The runtime config is embedded at build time via feature flags in the MCP server bundle.
 *
 * @param {object} runtimeConfig - the runtime configuration object from src/runtimes/*.js
 * @returns {function} MCP tool handler
 */
function createHandler(runtimeConfig) {
  const agentNames = KNOWN_AGENTS.map((name) =>
    runtimeConfig.agentNaming === 'kebab-case' ? name.replace(/_/g, '-') : name
  );

  const prefix = runtimeConfig.name === 'claude' ? 'maestro:' : '';

  return function handleGetRuntimeContext(_params) {
    return {
      runtime: runtimeConfig.name,
      tools: runtimeConfig.tools || {},
      agent_dispatch: {
        pattern: runtimeConfig.delegationPattern || '',
        naming: runtimeConfig.agentNaming || 'kebab-case',
        prefix,
      },
      mcp_prefix: MCP_PREFIXES[runtimeConfig.name] || '',
      paths: runtimeConfig.paths || {},
      agents: agentNames,
      agent_capabilities: AGENT_CAPABILITIES,
    };
  };
}

module.exports = { createHandler };
