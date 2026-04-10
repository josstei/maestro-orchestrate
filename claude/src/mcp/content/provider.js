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

function createProviderForSource(source, runtimeConfig, canonicalSrcRoot) {
  if (source === CONTENT_SOURCES.NONE) {
    return null;
  }

  if (source === CONTENT_SOURCES.FILESYSTEM) {
    return createFilesystemProvider(runtimeConfig, canonicalSrcRoot);
  }

  throw new Error(`Unknown content source: "${source}"`);
}

function createContentProvider(runtimeConfig, canonicalSrcRoot = resolveCanonicalSrcFromExtensionRoot()) {
  const providers = [];
  const { primary, fallback } = normalizeContentPolicy(runtimeConfig);
  const seenSources = new Set();

  for (const source of [primary, fallback]) {
    if (seenSources.has(source)) {
      continue;
    }

    seenSources.add(source);

    const provider = createProviderForSource(source, runtimeConfig, canonicalSrcRoot);
    if (provider) {
      providers.push(provider);
    }
  }

  return {
    readResource(id) {
      for (const provider of providers) {
        const result = provider.readResource(id);
        if (result) {
          return result;
        }
      }

      return { error: `No content provider could read resource "${id}"` };
    },

    readAgent(agentName) {
      for (const provider of providers) {
        const result = provider.readAgent(agentName);
        if (result) {
          return result;
        }
      }

      return { error: `No content provider could read agent "${agentName}"` };
    },
  };
}

module.exports = {
  CONTENT_SOURCES,
  createContentProvider,
  createFilesystemProvider,
  normalizeContentPolicy,
};
