'use strict';

const path = require('node:path');
const { readJsonSafe } = require('../lib/io');

const PACKAGE_NAME = '@josstei/maestro';
const VERSION_JSON_FILENAME = 'version.json';

/**
 * The Maestro version: from the nearest @josstei/maestro package.json above
 * this module, else from the <src>/version.json the generator stamps into
 * detached payloads, else 'unknown'.
 * @returns {string}
 */
function resolveVersion() {
  for (let dir = __dirname; ; dir = path.dirname(dir)) {
    const pkg = readJsonSafe(path.join(dir, 'package.json'));
    if (pkg && pkg.name === PACKAGE_NAME && typeof pkg.version === 'string') {
      return pkg.version;
    }
    if (path.dirname(dir) === dir) break;
  }

  const stamped = readJsonSafe(path.join(__dirname, '..', VERSION_JSON_FILENAME));
  return stamped && typeof stamped.version === 'string' ? stamped.version : 'unknown';
}

module.exports = {
  VERSION_JSON_FILENAME,
  resolveVersion,
};
