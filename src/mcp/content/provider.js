'use strict';

const path = require('path');
const { resolveCanonicalSrcFromExtensionRoot } = require('../utils/extension-root');
const {
  readResourceFromFilesystem,
  readAgentFromFilesystem,
} = require('./runtime-content');

const CONTENT_SOURCES = Object.freeze({
  FILESYSTEM: 'filesystem',
  NONE: 'none',
});

function createFilesystemProvider(
  runtimeConfig,
  canonicalSrcRoot = resolveCanonicalSrcFromExtensionRoot(),
  sourceName = CONTENT_SOURCES.FILESYSTEM
) {
  const srcRoot = path.resolve(canonicalSrcRoot);

  return {
    name: sourceName,
    srcRoot,

    readResource(id) {
      return readResourceFromFilesystem(id, runtimeConfig, srcRoot);
    },

    readAgent(agentName) {
      return readAgentFromFilesystem(agentName, runtimeConfig, srcRoot);
    },
  };
}

function normalizeContentPolicy(runtimeConfig) {
  const content = runtimeConfig && runtimeConfig.content;
  const fallback = content && content.fallback;

  if (fallback && fallback !== CONTENT_SOURCES.NONE) {
    throw new Error(`Content fallback is not supported in no-fallback mode: "${fallback}"`);
  }

  return {
    primary: content && content.primary ? content.primary : CONTENT_SOURCES.FILESYSTEM,
  };
}

function resolveSourceRoot(source, canonicalSrcRoot) {
  const srcRoot = path.resolve(canonicalSrcRoot);

  if (source === CONTENT_SOURCES.FILESYSTEM) {
    return srcRoot;
  }

  return null;
}

function createContentSourceSpecs(
  runtimeConfig,
  canonicalSrcRoot = resolveCanonicalSrcFromExtensionRoot()
) {
  const { primary } = normalizeContentPolicy(runtimeConfig);

  if (primary === CONTENT_SOURCES.NONE) {
    return [];
  }

  if (primary !== CONTENT_SOURCES.FILESYSTEM) {
    throw new Error(`Unknown content source: "${primary}"`);
  }

  return [{ sourceName: primary, srcRoot: resolveSourceRoot(primary, canonicalSrcRoot) }];
}

function createContentProvider(runtimeConfig, canonicalSrcRoot = resolveCanonicalSrcFromExtensionRoot()) {
  const specs = createContentSourceSpecs(runtimeConfig, canonicalSrcRoot);

  if (specs.length === 0) {
    throw new Error('Runtime content source must be filesystem in no-fallback mode');
  }

  const [spec] = specs;
  return createFilesystemProvider(runtimeConfig, spec.srcRoot, spec.sourceName);
}

module.exports = {
  CONTENT_SOURCES,
  createContentSourceSpecs,
  createContentProvider,
  createFilesystemProvider,
  normalizeContentPolicy,
};
