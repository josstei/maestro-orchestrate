import { defineTool } from '../contracts.js';
import { zodSchemas } from './zod-schemas.js';
import { createHandler as createSkillContentHandler } from '../../handlers/get-skill-content.js';
import { createHandler as createAgentHandler } from '../../handlers/get-agent.js';
import { createHandler as createRuntimeContextHandler } from '../../handlers/get-runtime-context.js';
import { getDefaultRuntimeConfig, normalizeRuntimeConfig } from '../../runtime/runtime-config-map.js';

/**
 * Register the `content` pack's 3 tools (`get_skill_content`, `get_agent`,
 * `get_runtime_context`) via `defineTool`, each consuming its shape from
 * `./zod-schemas.js`. None of these tools require an initialized workspace.
 *
 * @param {{server: object, registry: object, runtimeConfig?: object, services?: {canonicalSrcRoot?: string, workspaceSuggestion?: Function}}} options
 */
function registerContentPack({ server, registry, ...contextOptions } = {}) {
  const runtimeConfig = normalizeRuntimeConfig(
    contextOptions.runtimeConfig || getDefaultRuntimeConfig()
  );
  const canonicalSrcRoot =
    contextOptions.services &&
    typeof contextOptions.services.canonicalSrcRoot === 'string' &&
    contextOptions.services.canonicalSrcRoot.length > 0
      ? contextOptions.services.canonicalSrcRoot
      : undefined;
  const workspaceSuggestion =
    contextOptions.services && typeof contextOptions.services.workspaceSuggestion === 'function'
      ? contextOptions.services.workspaceSuggestion
      : () => null;

  const handleGetSkillContent = createSkillContentHandler(runtimeConfig, canonicalSrcRoot);
  const handleGetAgent = createAgentHandler(runtimeConfig, canonicalSrcRoot);
  const handleGetRuntimeContext = createRuntimeContextHandler(runtimeConfig, workspaceSuggestion);

  defineTool({
    server,
    registry,
    name: 'get_skill_content',
    description:
      'Read one or more Maestro skills, protocols, templates, or references from the runtime-configured Maestro content source and apply runtime-specific transforms before returning them.',
    schema: zodSchemas.get_skill_content,
    handler: (args) => handleGetSkillContent(args),
    ...contextOptions,
  });

  defineTool({
    server,
    registry,
    name: 'get_agent',
    description:
      'Read one or more Maestro agent methodology definitions. Returns the methodology body, declared tool restrictions, and a runtime-specific tool_name for dispatch.',
    schema: zodSchemas.get_agent,
    handler: (args) => handleGetAgent(args),
    ...contextOptions,
  });

  defineTool({
    server,
    registry,
    name: 'get_runtime_context',
    description:
      'Returns tool mappings, agent dispatch syntax, MCP prefixes, and path variables for the current Maestro runtime. Call once at session start (step 0) and carry the returned context through the session.',
    schema: zodSchemas.get_runtime_context,
    handler: (args) => handleGetRuntimeContext(args),
    ...contextOptions,
  });
}

export { registerContentPack };
