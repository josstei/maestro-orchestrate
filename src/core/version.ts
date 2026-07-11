import path from 'node:path';
import { readJsonSafe } from '../lib/io/index.js';
import { moduleDirname } from './package-root.js';
import { PACKAGE_NAME, findPackageRoot } from './package-root.js';
const VERSION_JSON_FILENAME = 'version.json';

function findPackageJsonVersion(startDir: string): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageRoot = findPackageRoot(currentDir, { malformedJson: 'skip' });
    if (!packageRoot) return null;

    const pkg = readJsonSafe<{ version?: unknown }>(path.join(packageRoot, 'package.json'));
    if (pkg && typeof pkg.version === 'string') {
      return pkg.version;
    }

    const parentDir = path.dirname(packageRoot);
    if (parentDir === packageRoot) return null;
    currentDir = parentDir;
  }
}

function findVersionJsonFallback(): string | null {
  const versionJsonPath = path.join(moduleDirname(import.meta.url), '..', VERSION_JSON_FILENAME);
  const versionData = readJsonSafe<{ version?: unknown }>(versionJsonPath);

  if (versionData && typeof versionData.version === 'string') {
    return versionData.version;
  }

  return null;
}

function resolveVersion(startDir: string): string {
  return findPackageJsonVersion(startDir) || findVersionJsonFallback() || 'unknown';
}

export { PACKAGE_NAME, resolveVersion };
