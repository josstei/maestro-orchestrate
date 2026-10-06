'use strict';

const { getDefaultRuntimeConfig } = require('../runtime/runtime-config-map');
const { readResourceFromFilesystem } = require('../content/runtime-content');
const { resolveCanonicalSrcFromExtensionRoot } = require('../utils/extension-root');
const { ValidationError } = require('../../lib/errors');

function createHandler(runtimeConfig = getDefaultRuntimeConfig(), canonicalSrcRoot) {
  return function handleGetSkillContent(params) {
    const resources = params.resources;
    if (!Array.isArray(resources) || resources.length === 0) {
      throw new ValidationError('resources must be a non-empty array of resource identifiers');
    }

    const srcRoot =
      canonicalSrcRoot === undefined ? resolveCanonicalSrcFromExtensionRoot() : canonicalSrcRoot;
    const contents = {};
    const errors = {};

    // readResourceFromFilesystem rejects ids outside RESOURCE_ALLOWLIST.
    for (const id of resources) {
      const result = readResourceFromFilesystem(id, runtimeConfig, srcRoot);
      if (result.error) {
        errors[id] = result.error;
        continue;
      }

      contents[id] = result.content;
    }

    return { contents, errors };
  };
}

module.exports = {
  createHandler,
};
