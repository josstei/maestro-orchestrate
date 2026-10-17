'use strict';

const { KNOWN_AGENTS, AGENT_CAPABILITIES } = require('../../core/agent-registry');
const { toKebabCase } = require('../../lib/naming');

const MCP_PREFIXES = {
  gemini: 'mcp_maestro_',
  claude: 'mcp__plugin_maestro_maestro__',
  codex: 'mcp__maestro_maestro__',
};

const PLAN_MODE_NATIVE = { claude: true, gemini: true, codex: false, qwen: false };

function createHandler(runtimeConfig, getWorkspaceSuggestion = () => null) {
  const agentNames = KNOWN_AGENTS.map((name) =>
    runtimeConfig.agentNaming === 'kebab-case'
      ? toKebabCase(name)
      : name
  );

  const prefix = runtimeConfig.name === 'claude' ? 'maestro:' : '';
  const delegation = runtimeConfig.delegation || { pattern: '', constraints: {} };

  return function handleGetRuntimeContext(_params) {
    return {
      runtime: runtimeConfig.name,
      tools: runtimeConfig.tools || {},
      agent_dispatch: {
        pattern: delegation.pattern || '',
        naming: runtimeConfig.agentNaming || 'kebab-case',
        prefix,
      },
      delegation: {
        pattern: delegation.pattern || '',
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
