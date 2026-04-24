'use strict';

const path = require('node:path');
const { resolveCanonicalProjectRoot, resolveCanonicalSrcRoot } = require('../../core/canonical-source');

function resolveExtensionRoot() {
  if (process.env.MAESTRO_EXTENSION_PATH) {
    return process.env.MAESTRO_EXTENSION_PATH;
  }

  const serverFile = process.argv[1];
  if (serverFile) {
    return path.resolve(path.dirname(serverFile), '..');
  }

  return process.cwd();
}

function resolveRepoRoot() {
  return resolveCanonicalProjectRoot(resolveExtensionRoot());
}

function resolveCanonicalSrcFromExtensionRoot() {
  return resolveCanonicalSrcRoot(resolveExtensionRoot());
}

module.exports = {
  resolveCanonicalSrcFromExtensionRoot,
  resolveExtensionRoot,
  resolveRepoRoot,
};
