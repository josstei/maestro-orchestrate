'use strict';

const fs = require('fs');
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

/**
 * Walk up from the extension root to the first directory containing
 * src/mcp/maestro-server.js and return its src/ path.
 */
function resolveCanonicalSrcFromExtensionRoot() {
  const startDir = resolveExtensionRoot();
  let current = path.resolve(startDir);

  while (!fs.existsSync(path.join(current, 'src', 'mcp', 'maestro-server.js'))) {
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate canonical src/ from "${startDir}"`);
    }

    current = parent;
  }

  return path.join(current, 'src');
}

module.exports = {
  resolveCanonicalSrcFromExtensionRoot,
};
