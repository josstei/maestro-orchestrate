import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../../..');
const SRC = path.join(ROOT, 'src');
const DIST_SRC = path.join(ROOT, 'dist', 'src');

const ASSET_ROOTS = Object.freeze([
  'agents',
  'skills',
  'references',
  'templates',
  'entry-points/templates',
  'generated',
]);

const ASSET_EXTENSIONS = new Set(['.md', '.tmpl', '.json']);
function copyAssetFile(sourcePath: string, relativePath: string): void {
  const targetPath = path.join(DIST_SRC, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyAssetsFrom(relativeRoot: string): number {
  const sourceRoot = path.join(SRC, relativeRoot);
  if (!fs.existsSync(sourceRoot)) {
    return 0;
  }

  let copied = 0;
  const queue = [sourceRoot];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    if (!currentDir) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const sourcePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        queue.push(sourcePath);
        continue;
      }

      if (!entry.isFile() || !ASSET_EXTENSIONS.has(path.extname(entry.name))) {
        continue;
      }

      copyAssetFile(sourcePath, path.relative(SRC, sourcePath));
      copied += 1;
    }
  }

  return copied;
}

function copyRuntimeAssets(): number {
  return ASSET_ROOTS.reduce((count, relativeRoot) => count + copyAssetsFrom(relativeRoot), 0);
}

function isDirectInvocation(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && path.resolve(entrypoint) === moduleFilename);
}

if (isDirectInvocation()) {
  const copied = copyRuntimeAssets();
  console.log(`Copied ${copied} runtime asset files to ${path.relative(ROOT, DIST_SRC)}`);
}

export { ASSET_ROOTS, copyRuntimeAssets };
