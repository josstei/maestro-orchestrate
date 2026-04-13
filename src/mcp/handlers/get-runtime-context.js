'use strict';

const { KNOWN_AGENTS, AGENT_CAPABILITIES } = require('../../core/agent-registry');
const { normalizeRuntimeConfig } = require('../runtime/runtime-config-map');
const { toKebabCase } = require('../../lib/naming');

const MCP_PREFIXES = {
  gemini: 'mcp_maestro_',
  claude: 'mcp__plugin_maestro_maestro__',
  codex: 'mcp__maestro_maestro__',
};

function createHandler(runtimeConfig) {
  const resolvedRuntimeConfig = normalizeRuntimeConfig(runtimeConfig);
  const agentNames = KNOWN_AGENTS.map((name) =>
    resolvedRuntimeConfig.agentNaming === 'kebab-case'
      ? toKebabCase(name)
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

module.exports = { createHandler };
