import { KNOWN_AGENTS, AGENT_CAPABILITIES } from '../../core/agent-registry.js';
import { getDefaultRuntimeConfig, normalizeRuntimeConfig } from '../runtime/runtime-config-map.js';
import { toKebabCase } from '../../lib/naming/index.js';

/**
 * Return the runtime dispatch context: tool mappings, agent dispatch syntax,
 * MCP prefix, path variables, and the workspace suggestion. Runtime config
 * and the workspace-suggestion provider are read from the handler context.
 *
 * @param {object} _params
 * @param {{ runtimeConfig?: object, services?: { workspaceSuggestion?: Function } }} ctx
 * @returns {object}
 */
function handleGetRuntimeContext(_params: any, ctx: any = {}) {
  const resolvedRuntimeConfig = normalizeRuntimeConfig(ctx.runtimeConfig || getDefaultRuntimeConfig());
  const services = ctx.services || {};
  const getWorkspaceSuggestion =
    typeof services.workspaceSuggestion === 'function' ? services.workspaceSuggestion : () => null;
  const agentNames = KNOWN_AGENTS.map((name: any) =>
    resolvedRuntimeConfig.agentNaming === 'kebab-case'
      ? toKebabCase(name)
      : name
  );
  const delegation = resolvedRuntimeConfig.delegation || { pattern: '', constraints: {} };

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
}

export { handleGetRuntimeContext };
