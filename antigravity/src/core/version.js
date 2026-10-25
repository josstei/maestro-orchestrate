'use strict';

const path = require('node:path');
const { readJsonSafe } = require('../lib/io');

const PACKAGE_NAME = '@josstei/maestro';
const VERSION_JSON_FILENAME = 'version.json';
const SRC_ROOT = path.resolve(__dirname, '..');

/**
 * The version of the install this module runs from: the Maestro package.json
 * beside its src/ (a checkout or the npm package), else the version.json a
 * detached payload ships in src/, else 'unknown'.
 */
function resolveVersion() {
  const pkg = readJsonSafe(path.join(SRC_ROOT, '..', 'package.json'));
  if (pkg && pkg.name === PACKAGE_NAME && typeof pkg.version === 'string') {
    return pkg.version;
  }

  const versionData = readJsonSafe(path.join(SRC_ROOT, VERSION_JSON_FILENAME));
  if (versionData && typeof versionData.version === 'string') {
    return versionData.version;
  }

  return 'unknown';
}

module.exports = {
  VERSION_JSON_FILENAME,
  resolveVersion,
};
