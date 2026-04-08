'use strict';

const path = require('path');

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

function resolveSrcRoot(srcRelativePath = 'src') {
  return path.resolve(resolveExtensionRoot(), srcRelativePath);
}

module.exports = {
  resolveExtensionRoot,
  resolveSrcRoot,
};
