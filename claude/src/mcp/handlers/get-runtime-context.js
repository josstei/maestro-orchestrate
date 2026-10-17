'use strict';

const { AGENT_NAMES, KNOWN_AGENTS, AGENT_CAPABILITIES } = require('../../core/agent-registry');

const MCP_PREFIXES = {
  gemini: 'mcp_maestro_',
  claude: 'mcp__plugin_maestro_maestro__',
  codex: 'mcp__maestro_maestro__',
};

const PLAN_MODE_NATIVE = { claude: true, gemini: true, codex: false, qwen: false };

function createHandler(runtimeConfig, getWorkspaceSuggestion = () => null) {
  const agentNames = runtimeConfig.agentNaming === 'snake_case' ? KNOWN_AGENTS : AGENT_NAMES;

  const prefix = runtimeConfig.name === 'claude' ? 'maestro:' : '';
  const delegation = runtimeConfig.delegation || {};
  const pattern = delegation.pattern || '';

  return function handleGetRuntimeContext(_params) {
    return {
      runtime: runtimeConfig.name,
      tools: runtimeConfig.tools || {},
      agent_dispatch: {
        pattern,
        naming: runtimeConfig.agentNaming || 'kebab-case',
        prefix,
      },
      delegation: {
        pattern,
        constraints: delegation.constraints || {},
      },
      mcp_prefix: MCP_PREFIXES[runtimeConfig.name] || '',
      paths: runtimeConfig.paths || {},
      agents: agentNames,
      agent_capabilities: AGENT_CAPABILITIES,
      plan_mode_native: PLAN_MODE_NATIVE[runtimeConfig.name] || false,
      workspace_suggestion: getWorkspaceSuggestion() || null,
    };
  };
}

module.exports = { createHandler };
