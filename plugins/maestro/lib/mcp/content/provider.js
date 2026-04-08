'use strict';

const path = require('path');

const { resolveExtensionRoot, resolveSrcRoot } = require('../utils/extension-root');
const {
  readResourceFromFilesystem,
  readAgentFromFilesystem,
} = require('./runtime-content');

const CONTENT_SOURCES = Object.freeze({
  FILESYSTEM: 'filesystem',
  REGISTRY: 'registry',
  NONE: 'none',
});

function loadOptionalModule(modulePath) {
  try {
    return require(modulePath);
  } catch (err) {
    if (
      err &&
      err.code === 'MODULE_NOT_FOUND' &&
      typeof err.message === 'string' &&
      err.message.includes(modulePath)
    ) {
      return null;
    }
    throw err;
  }
}

function loadGeneratedRegistries(extensionRoot) {
  const resourceRegistryPath = path.join(extensionRoot, 'lib', 'mcp', 'generated', 'resource-registry.js');
  const agentRegistryPath = path.join(extensionRoot, 'lib', 'mcp', 'generated', 'agent-registry.js');

  const resourceModule = loadOptionalModule(resourceRegistryPath);
  const agentModule = loadOptionalModule(agentRegistryPath);

  return {
    resources: resourceModule && resourceModule.RESOURCE_REGISTRY,
    agents: agentModule && agentModule.AGENT_REGISTRY,
  };
}

function createRegistryProvider(extensionRoot = resolveExtensionRoot()) {
  const { resources, agents } = loadGeneratedRegistries(extensionRoot);

  if (!resources && !agents) {
    return null;
  }

  return {
    readResource(id) {
      if (resources && Object.prototype.hasOwnProperty.call(resources, id)) {
        return { content: resources[id] };
      }
      return null;
    },

    readAgent(agentName) {
      if (agents && Object.prototype.hasOwnProperty.call(agents, agentName)) {
        return { agent: agents[agentName] };
      }
      return null;
    },
  };
}

function createFilesystemProvider(runtimeConfig, srcRelativePath) {
  const srcRoot = resolveSrcRoot(srcRelativePath);

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

function createProviderForSource(source, runtimeConfig, srcRelativePath) {
  if (source === CONTENT_SOURCES.NONE) {
    return null;
  }

  if (source === CONTENT_SOURCES.REGISTRY) {
    return createRegistryProvider();
  }

  if (source === CONTENT_SOURCES.FILESYSTEM) {
    return createFilesystemProvider(runtimeConfig, srcRelativePath);
  }

  throw new Error(`Unknown content source: "${source}"`);
}

function createContentProvider(runtimeConfig, srcRelativePath = 'src') {
  const providers = [];
  const { primary, fallback } = normalizeContentPolicy(runtimeConfig);
  const seenSources = new Set();

  for (const source of [primary, fallback]) {
    if (seenSources.has(source)) {
      continue;
    }

    seenSources.add(source);

    const provider = createProviderForSource(source, runtimeConfig, srcRelativePath);
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
  createRegistryProvider,
  loadGeneratedRegistries,
  normalizeContentPolicy,
};
