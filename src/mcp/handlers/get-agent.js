import { getDefaultRuntimeConfig, normalizeRuntimeConfig } from '../runtime/runtime-config-map.js';
import { AGENT_ALLOWLIST } from '../content/runtime-content.js';
import { createContentProvider } from '../content/provider.js';
import { ValidationError } from '../../lib/errors/index.js';
import { toSnakeCase, toKebabCase } from '../../lib/naming/index.js';

/**
 * Read one or more Maestro agent methodology definitions through the
 * runtime-configured content provider, resolving each agent's
 * runtime-specific dispatch tool_name. Runtime config and the canonical
 * source root are read from the handler context.
 *
 * @param {{ agents: string[] }} params
 * @param {{ runtimeConfig?: object, services?: { canonicalSrcRoot?: string } }} ctx
 * @returns {{ agents: Record<string, object>, errors: Record<string, string> }}
 */
function handleGetAgent(params, ctx = {}) {
  const requestedAgents = params.agents;
  if (!Array.isArray(requestedAgents) || requestedAgents.length === 0) {
    throw new ValidationError('agents must be a non-empty array of agent identifiers');
  }

  const runtimeConfig = normalizeRuntimeConfig(ctx.runtimeConfig || getDefaultRuntimeConfig());
  const services = ctx.services || {};
  const canonicalSrcRoot =
    typeof services.canonicalSrcRoot === 'string' && services.canonicalSrcRoot.length > 0
      ? services.canonicalSrcRoot
      : undefined;

  const provider = createContentProvider(runtimeConfig, canonicalSrcRoot);
  const agents = {};
  const errors = {};

  for (const rawName of requestedAgents) {
    const inputName = String(rawName || '').trim();
    const canonicalName = toKebabCase(inputName);

    if (!AGENT_ALLOWLIST.includes(canonicalName)) {
      errors[inputName || '(empty)'] =
        `Unknown agent identifier: "${inputName}". Known identifiers: ${AGENT_ALLOWLIST.join(', ')}`;
      continue;
    }

    const result = provider.readAgent(canonicalName);
    if (result.error) {
      errors[inputName] = result.error;
      continue;
    }

    const toolName =
      runtimeConfig.agentNaming === 'snake_case'
        ? toSnakeCase(canonicalName)
        : canonicalName;

    agents[inputName] = { ...result.agent, tool_name: toolName };
  }

  return { agents, errors };
}

export { AGENT_ALLOWLIST, handleGetAgent };
