import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { moduleDirname, moduleFilename } from '../core/package-root.js';
import { buildRegistryModel, collectRegistryOutputs } from '../generator/registry-scanner.js';
import {
  RUNTIME_CONTENT_PAYLOAD,
  RUNTIME_CONTENT_REGISTRY,
  createPackedRuntimeContentRegistry,
  createRuntimeContentManifest,
} from '../generator/runtime-content-manifest.js';
import type { RegistryModel } from '../generator/types.js';

const MODULE_FILENAME = moduleFilename(import.meta.url);
const ROOT = path.resolve(moduleDirname(import.meta.url), '../../..');
const SRC = path.join(ROOT, 'src');
const DIST_SRC = path.join(ROOT, 'dist', 'src');
const ASSET_ROOTS = Object.freeze([
  'entry-points/templates',
]);

const RUNTIME_CONTENT_ROOTS = Object.freeze([
  'agent-profiles',
  'agents',
  'skills',
  'references',
  'templates',
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

function writeRuntimeContentRegistry(model: RegistryModel): void {
  const targetPath = path.join(DIST_SRC, 'generated', RUNTIME_CONTENT_REGISTRY);
  const payloadPath = path.join(DIST_SRC, 'generated', RUNTIME_CONTENT_PAYLOAD);
  const manifest = createRuntimeContentManifest(SRC, model);
  const { registry, payload } = createPackedRuntimeContentRegistry(SRC, manifest);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(registry)}\n`);
  fs.writeFileSync(payloadPath, gzipSync(payload, { level: 9 }));
}

function writeRegistryOutputs(model: RegistryModel): number {
  const outputs = collectRegistryOutputs(model, 'generated');
  for (const output of outputs) {
    const targetPath = path.join(DIST_SRC, output.outputPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, output.content);
  }
  return outputs.length;
}

function removeRetiredRuntimeContentRoots(): void {
  for (const relativeRoot of RUNTIME_CONTENT_ROOTS) {
    fs.rmSync(path.join(DIST_SRC, relativeRoot), { recursive: true, force: true });
  }
}

function copyRuntimeAssets(model = buildRegistryModel(SRC)): number {
  removeRetiredRuntimeContentRoots();
  const copied = ASSET_ROOTS.reduce((count, relativeRoot) => count + copyAssetsFrom(relativeRoot), 0);
  const registries = writeRegistryOutputs(model);
  writeRuntimeContentRegistry(model);
  return copied + registries + 2;
}

function isDirectInvocation(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && path.resolve(entrypoint) === MODULE_FILENAME);
}

if (isDirectInvocation()) {
  const copied = copyRuntimeAssets();
  console.log(`Copied ${copied} runtime asset files to ${path.relative(ROOT, DIST_SRC)}`);
}

export { ASSET_ROOTS, RUNTIME_CONTENT_ROOTS, copyRuntimeAssets };
