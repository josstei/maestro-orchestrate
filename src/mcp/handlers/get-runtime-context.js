import { KNOWN_AGENTS, AGENT_CAPABILITIES } from '../../core/agent-registry.js';
import { normalizeRuntimeConfig } from '../runtime/runtime-config-map.js';
import { toKebabCase } from '../../lib/naming/index.js';

function createHandler(runtimeConfig, getWorkspaceSuggestion = () => null) {
  const resolvedRuntimeConfig = normalizeRuntimeConfig(runtimeConfig);
  const agentNames = KNOWN_AGENTS.map((name) =>
    resolvedRuntimeConfig.agentNaming === 'kebab-case'
      ? toKebabCase(name)
      : name
  );

  const delegation = resolvedRuntimeConfig.delegation || { pattern: '', constraints: {} };

  return function handleGetRuntimeContext(_params) {
    return {
      runtime: resolvedRuntimeConfig.name,
      tools: resolvedRuntimeConfig.tools || {},
      delegation: {
        pattern: delegation.pattern || '',
        constraints: delegation.constraints || {},
        naming: resolvedRuntimeConfig.agentNaming || 'kebab-case',
      },
      mcp_prefix: resolvedRuntimeConfig.mcpPrefix || '',
      paths: resolvedRuntimeConfig.paths || {},
      agents: agentNames,
      agent_capabilities: AGENT_CAPABILITIES,
      plan_mode_native: resolvedRuntimeConfig.plan_mode_native || false,
      workspace_suggestion: getWorkspaceSuggestion() || null,
    };
  };
}

export { createHandler };
