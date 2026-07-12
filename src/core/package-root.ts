import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@josstei/maestro';

type MalformedPackageJsonPolicy = 'skip' | 'throw';

interface PackageRootSearchOptions {
  readonly packageName?: string;
  readonly malformedJson?: MalformedPackageJsonPolicy;
}

function findPackageRoot(startDir: string, options: PackageRootSearchOptions = {}): string | null {
  const packageName = options.packageName ?? PACKAGE_NAME;
  const malformedJson = options.malformedJson ?? 'throw';
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { name?: unknown } | null;
        if (pkg?.name === packageName) {
          return currentDir;
        }
      } catch (error) {
        if (malformedJson === 'throw') {
          throw error;
        }
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function resolvePackageRoot(startDir: string, options: PackageRootSearchOptions = {}): string {
  const root = findPackageRoot(startDir, options);
  if (root) return root;

  const packageName = options.packageName ?? PACKAGE_NAME;
  throw new Error(`Unable to locate ${packageName} package root from ${startDir}`);
}

function moduleFilename(moduleUrl: string): string {
  return fileURLToPath(moduleUrl);
}

function moduleDirname(moduleUrl: string): string {
  return path.dirname(moduleFilename(moduleUrl));
}

export {
  PACKAGE_NAME,
  findPackageRoot,
  moduleDirname,
  moduleFilename,
  resolvePackageRoot,
};
export type { MalformedPackageJsonPolicy, PackageRootSearchOptions };
