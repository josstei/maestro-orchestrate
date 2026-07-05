import fs from 'node:fs';
import path from 'node:path';
import { readJsonSafe } from '../lib/io/index.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const PACKAGE_NAME = '@josstei/maestro';
const VERSION_JSON_FILENAME = 'version.json';

function findPackageJsonVersion(startDir) {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, 'package.json');

    if (fs.existsSync(candidate)) {
      const pkg = readJsonSafe(candidate);
      if (pkg && pkg.name === PACKAGE_NAME && typeof pkg.version === 'string') {
        return pkg.version;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function findVersionJsonFallback() {
  const versionJsonPath = path.join(moduleDirname, '..', VERSION_JSON_FILENAME);
  const versionData = readJsonSafe(versionJsonPath);

  if (versionData && typeof versionData.version === 'string') {
    return versionData.version;
  }

  return null;
}

function resolveVersion(startDir) {
  return findPackageJsonVersion(startDir) || findVersionJsonFallback() || 'unknown';
}

export { PACKAGE_NAME, resolveVersion };
