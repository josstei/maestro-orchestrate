'use strict';

const path = require('node:path');
const { readJsonSafe } = require('../lib/io');

const PACKAGE_NAME = '@josstei/maestro';
const VERSION_JSON_FILENAME = 'version.json';

function findPackageJsonVersion(startDir) {
  let currentDir = path.resolve(startDir);

  while (true) {
    const pkg = readJsonSafe(path.join(currentDir, 'package.json'));
    if (pkg && pkg.name === PACKAGE_NAME && typeof pkg.version === 'string') {
      return pkg.version;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function findVersionJsonFallback() {
  const versionJsonPath = path.join(__dirname, '..', VERSION_JSON_FILENAME);
  const versionData = readJsonSafe(versionJsonPath);

  if (versionData && typeof versionData.version === 'string') {
    return versionData.version;
  }

  return null;
}

function resolveVersion(startDir) {
  return findPackageJsonVersion(startDir) || findVersionJsonFallback() || 'unknown';
}

module.exports = {
  resolveVersion,
};
