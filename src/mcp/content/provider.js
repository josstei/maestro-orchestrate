'use strict';

const path = require('path');
const { resolveCanonicalSrcFromExtensionRoot } = require('../utils/extension-root');
const {
  readResourceFromFilesystem,
  readAgentFromFilesystem,
} = require('./runtime-content');

function createFilesystemProvider(
  runtimeConfig,
  canonicalSrcRoot = resolveCanonicalSrcFromExtensionRoot()
) {
  const srcRoot = path.resolve(canonicalSrcRoot);

  return {
    name: 'filesystem',
    srcRoot,

    readResource(id) {
      return readResourceFromFilesystem(id, runtimeConfig, srcRoot);
    },

    readAgent(agentName) {
      return readAgentFromFilesystem(agentName, runtimeConfig, srcRoot);
    },
  };
}

function createContentProvider(runtimeConfig, canonicalSrcRoot = resolveCanonicalSrcFromExtensionRoot()) {
  return createFilesystemProvider(runtimeConfig, canonicalSrcRoot);
}

module.exports = {
  createContentProvider,
  createFilesystemProvider,
};
