'use strict';

const { KNOWN_AGENTS, AGENT_CAPABILITIES } = require('../../core/agent-registry');
const { getRuntimeConfig, getDefaultRuntimeConfig } = require('../runtime/runtime-config-map');

const MCP_PREFIXES = {
  gemini: 'mcp_maestro_',
  claude: 'mcp__plugin_maestro_maestro__',
  codex: 'mcp__maestro_maestro__',
};

/**
 * Create a get_runtime_context handler bound to a specific runtime config.
 * Runtime entrypoints resolve the canonical runtime config at startup.
 *
 * @param {object} runtimeConfig - the runtime configuration object from src/platforms/<runtime>/runtime-config.js
 * @returns {function} MCP tool handler
 */
function normalizeRuntimeConfig(runtimeConfig) {
  if (!runtimeConfig) {
    return getDefaultRuntimeConfig();
  }

  if (typeof runtimeConfig === 'string') {
    return getRuntimeConfig(runtimeConfig);
  }

  if (typeof runtimeConfig === 'object' && runtimeConfig.name) {
    return runtimeConfig;
  }

  return getDefaultRuntimeConfig();
}

function createHandler(runtimeConfig) {
  const resolvedRuntimeConfig = normalizeRuntimeConfig(runtimeConfig);
  const agentNames = KNOWN_AGENTS.map((name) =>
    resolvedRuntimeConfig.agentNaming === 'kebab-case'
      ? name.replace(/_/g, '-')
      : name
  );

  const prefix = resolvedRuntimeConfig.name === 'claude' ? 'maestro:' : '';

  return function handleGetRuntimeContext(_params) {
    return {
      runtime: resolvedRuntimeConfig.name,
      tools: resolvedRuntimeConfig.tools || {},
      agent_dispatch: {
        pattern: resolvedRuntimeConfig.delegationPattern || '',
        naming: resolvedRuntimeConfig.agentNaming || 'kebab-case',
        prefix,
      },
      mcp_prefix: MCP_PREFIXES[resolvedRuntimeConfig.name] || '',
      paths: resolvedRuntimeConfig.paths || {},
      agents: agentNames,
      agent_capabilities: AGENT_CAPABILITIES,
    };
  };
}

module.exports = { createHandler, normalizeRuntimeConfig };
