import { getDefaultRuntimeConfig, normalizeRuntimeConfig } from '../runtime/runtime-config-map.js';
import { AGENT_ALLOWLIST } from '../content/runtime-content.js';
import { createContentProvider } from '../content/provider.js';
import { toSnakeCase, toKebabCase } from '../../lib/naming/index.js';
import { normalizeGetAgentInput } from '../contracts/input-compatibility.js';

interface AgentHandlerResult {
  body: string;
  tools: readonly string[];
  tool_name: string;
}

interface GetAgentResult {
  agents: Record<string, AgentHandlerResult>;
  errors: Record<string, string>;
}

/**
 * Read one or more Maestro agent methodology definitions through the
 * runtime-configured content provider, resolving each agent's
 * runtime-specific dispatch tool_name. Runtime config and the canonical
 * source root are read from the handler context.
 *
 * External inputs are normalized first by `normalizeGetAgentInput`.
 *
 * @param {unknown} params
 * @param {{ runtimeConfig?: object, services?: { canonicalSrcRoot?: string } }} ctx
 * @returns {{ agents: Record<string, object>, errors: Record<string, string> }}
 */
function handleGetAgent(params: any, ctx: any = {}): GetAgentResult {
  const normalized = normalizeGetAgentInput(params);
  const requestedAgents = normalized.agents;

  const runtimeConfig = normalizeRuntimeConfig(ctx.runtimeConfig || getDefaultRuntimeConfig());
  const services = ctx.services || {};
  const canonicalSrcRoot =
    typeof services.canonicalSrcRoot === 'string' && services.canonicalSrcRoot.length > 0
      ? services.canonicalSrcRoot
      : undefined;

  const agents: Record<string, AgentHandlerResult> = {};
  let errors: Record<string, string> = {};
  const knownAgents: { readonly inputName: string; readonly canonicalName: string }[] = [];

  for (const rawName of requestedAgents) {
    const inputName = String(rawName || '').trim();
    const canonicalName = toKebabCase(inputName);

    if (!AGENT_ALLOWLIST.includes(canonicalName)) {
      const errorKey = inputName || '(empty)';
      errors = {
        ...errors,
        [errorKey]: `Unknown agent identifier: "${inputName}". Known identifiers: ${AGENT_ALLOWLIST.join(', ')}`,
      };
      continue;
    }

    knownAgents.push({ inputName, canonicalName });
  }

  if (knownAgents.length === 0) {
    return { agents, errors };
  }

  const provider = createContentProvider(runtimeConfig, canonicalSrcRoot);

  for (const { inputName, canonicalName } of knownAgents) {
    const result = provider.readAgent(canonicalName);
    if ('error' in result) {
      errors = { ...errors, [inputName]: result.error };
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
