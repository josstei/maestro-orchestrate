'use strict';

const { resolveCanonicalSrcFromExtensionRoot } = require('../utils/extension-root');
const {
  readResourceFromFilesystem,
  readAgentFromFilesystem,
} = require('./runtime-content');

const CONTENT_SOURCES = Object.freeze({
  FILESYSTEM: 'filesystem',
  NONE: 'none',
});

function createFilesystemProvider(runtimeConfig, canonicalSrcRoot = resolveCanonicalSrcFromExtensionRoot()) {
  const srcRoot = canonicalSrcRoot;

  return {
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

  return {
    primary: content && content.primary ? content.primary : CONTENT_SOURCES.FILESYSTEM,
    fallback: content && content.fallback ? content.fallback : CONTENT_SOURCES.NONE,
  };
}

/**
 * Every runtime configures `primary=filesystem, fallback=none`, so the
 * chain collapses to the filesystem provider with a shaped error for
 * `none`. If a future source is introduced, reintroduce chaining here.
 */
function createContentProvider(runtimeConfig, canonicalSrcRoot = resolveCanonicalSrcFromExtensionRoot()) {
  const { primary } = normalizeContentPolicy(runtimeConfig);

  if (primary === CONTENT_SOURCES.NONE) {
    return {
      readResource(id) {
        return { error: `No content provider could read resource "${id}"` };
      },
      readAgent(agentName) {
        return { error: `No content provider could read agent "${agentName}"` };
      },
    };
  }

  if (primary !== CONTENT_SOURCES.FILESYSTEM) {
    throw new Error(`Unknown content source: "${primary}"`);
  }

  return createFilesystemProvider(runtimeConfig, canonicalSrcRoot);
}

module.exports = {
  CONTENT_SOURCES,
  createContentProvider,
  createFilesystemProvider,
  normalizeContentPolicy,
};
