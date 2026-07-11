import { getDefaultRuntimeConfig, normalizeRuntimeConfig } from '../runtime/runtime-config-map.js';
import {
  RESOURCE_ALLOWLIST,
  applyRuntimeTransforms,
  isKnownResource,
} from '../content/runtime-content.js';
import { createContentProvider } from '../content/provider.js';

interface GetSkillContentResult {
  contents: Record<string, string>;
  errors: Record<string, string>;
}

/**
 * Read one or more Maestro content resources through the runtime-configured
 * content provider. Runtime config and the canonical source root are read
 * from the handler context (`ctx.runtimeConfig`, `ctx.services`), falling
 * back to the default runtime when the context carries none.
 *
 * @param {{ resources: string[] }} params
 * @param {{ runtimeConfig?: object, services?: { canonicalSrcRoot?: string } }} ctx
 * @returns {{ contents: Record<string, string>, errors: Record<string, string> }}
 */
function handleGetSkillContent(params: any, ctx: any = {}): GetSkillContentResult {
  const resources = params.resources;

  const runtimeConfig = normalizeRuntimeConfig(ctx.runtimeConfig || getDefaultRuntimeConfig());
  const services = ctx.services || {};
  const canonicalSrcRoot =
    typeof services.canonicalSrcRoot === 'string' && services.canonicalSrcRoot.length > 0
      ? services.canonicalSrcRoot
      : undefined;

  const contents: Record<string, string> = {};
  let errors: Record<string, string> = {};
  const knownResources: string[] = [];

  for (const id of resources) {
    if (!isKnownResource(id)) {
      errors = {
        ...errors,
        [id]: `Unknown resource identifier: "${id}". Known identifiers: ${Object.keys(RESOURCE_ALLOWLIST).join(', ')}`,
      };
      continue;
    }

    knownResources.push(id);
  }

  if (knownResources.length === 0) {
    return { contents, errors };
  }

  const provider = createContentProvider(runtimeConfig, canonicalSrcRoot);

  for (const id of knownResources) {
    const result = provider.readResource(id);
    if ('error' in result) {
      errors = { ...errors, [id]: result.error };
      continue;
    }

    contents[id] = result.content;
  }

  return { contents, errors };
}

export { RESOURCE_ALLOWLIST, applyRuntimeTransforms, handleGetSkillContent };
