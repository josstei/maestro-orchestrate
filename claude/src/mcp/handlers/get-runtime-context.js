'use strict';

const { KNOWN_AGENTS, AGENT_CAPABILITIES } = require('../../core/agent-registry');
const { normalizeRuntimeConfig } = require('../runtime/runtime-config-map');
const { toKebabCase } = require('../../lib/naming');

const MCP_PREFIXES = {
  gemini: 'mcp_maestro_',
  claude: 'mcp__plugin_maestro_maestro__',
  codex: 'mcp__maestro_maestro__',
};

const PLAN_MODE_NATIVE = { claude: true, gemini: true, codex: false, qwen: false };

function createHandler(runtimeConfig, getWorkspaceSuggestion = () => null) {
  const resolvedRuntimeConfig = normalizeRuntimeConfig(runtimeConfig);
  const agentNames = KNOWN_AGENTS.map((name) =>
    resolvedRuntimeConfig.agentNaming === 'kebab-case'
      ? toKebabCase(name)
      : name
  );

  const prefix = resolvedRuntimeConfig.name === 'claude' ? 'maestro:' : '';
  const delegation = resolvedRuntimeConfig.delegation || {
    pattern: resolvedRuntimeConfig.delegationPattern || '',
    constraints: {},
  };

  return function handleGetRuntimeContext(_params) {
    return {
      runtime: resolvedRuntimeConfig.name,
      tools: resolvedRuntimeConfig.tools || {},
      agent_dispatch: {
        pattern: delegation.pattern || '',
        naming: resolvedRuntimeConfig.agentNaming || 'kebab-case',
        prefix,
      },
      delegation: {
        pattern: delegation.pattern || '',
        constraints: delegation.constraints || {},
      },
      mcp_prefix: MCP_PREFIXES[resolvedRuntimeConfig.name] || '',
      paths: resolvedRuntimeConfig.paths || {},
      agents: agentNames,
      agent_capabilities: AGENT_CAPABILITIES,
      plan_mode_native: PLAN_MODE_NATIVE[resolvedRuntimeConfig.name] || false,
      workspace_suggestion: getWorkspaceSuggestion() || null,
    };
  };
}

module.exports = { createHandler };
