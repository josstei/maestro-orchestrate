'use strict';

const { getDefaultRuntimeConfig } = require('../runtime/runtime-config-map');
const {
  RESOURCE_ALLOWLIST,
  applyRuntimeTransforms,
} = require('../content/runtime-content');
const { createContentProvider } = require('../content/provider');

const DEFAULT_RUNTIME_CONFIG = getDefaultRuntimeConfig();

const DEFAULT_SRC_RELATIVE_PATH = 'src';

function createHandler(
  runtimeConfig = DEFAULT_RUNTIME_CONFIG,
  srcRelativePath = DEFAULT_SRC_RELATIVE_PATH
) {
  return function handleGetSkillContent(params) {
    const resources = params.resources;
    if (!Array.isArray(resources) || resources.length === 0) {
      throw new Error('resources must be a non-empty array of resource identifiers');
    }

    const provider = createContentProvider(runtimeConfig, srcRelativePath);
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
  };
}

const handleGetSkillContent = createHandler();

module.exports = {
  RESOURCE_ALLOWLIST,
  DEFAULT_RUNTIME_CONFIG,
  DEFAULT_SRC_RELATIVE_PATH,
  applyRuntimeTransforms,
  createHandler,
  handleGetSkillContent,
};
