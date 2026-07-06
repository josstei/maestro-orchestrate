import { getDefaultRuntimeConfig, normalizeRuntimeConfig } from '../runtime/runtime-config-map.js';
import { RESOURCE_ALLOWLIST, applyRuntimeTransforms } from '../content/runtime-content.js';
import { createContentProvider } from '../content/provider.js';
import { ValidationError } from '../../lib/errors/index.js';

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
function handleGetSkillContent(params, ctx = {}) {
  const resources = params.resources;
  if (!Array.isArray(resources) || resources.length === 0) {
    throw new ValidationError('resources must be a non-empty array of resource identifiers');
  }

  const runtimeConfig = normalizeRuntimeConfig(ctx.runtimeConfig || getDefaultRuntimeConfig());
  const services = ctx.services || {};
  const canonicalSrcRoot =
    typeof services.canonicalSrcRoot === 'string' && services.canonicalSrcRoot.length > 0
      ? services.canonicalSrcRoot
      : undefined;

  const provider = createContentProvider(runtimeConfig, canonicalSrcRoot);
  const contents = {};
  const errors = {};

  for (const id of resources) {
    if (!RESOURCE_ALLOWLIST[id]) {
      errors[id] = `Unknown resource identifier: "${id}". Known identifiers: ${Object.keys(RESOURCE_ALLOWLIST).join(', ')}`;
      continue;
    }

    const result = provider.readResource(id);
    if (result.error) {
      errors[id] = result.error;
      continue;
    }

    contents[id] = result.content;
  }

  return { contents, errors };
}

export { RESOURCE_ALLOWLIST, applyRuntimeTransforms, handleGetSkillContent };
