import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAgentSources } from '../core/agent-sources.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../../..');
const SRC = path.join(ROOT, 'src');
const DIST_SRC = path.join(ROOT, 'dist', 'src');
const RUNTIME_CONTENT_REGISTRY = 'runtime-content-registry.json';
const RUNTIME_CONTENT_PAYLOAD = 'runtime-content-registry.txt';

const ASSET_ROOTS = Object.freeze([
  'entry-points/templates',
  'generated',
]);

const RUNTIME_CONTENT_ROOTS = Object.freeze([
  'agent-profiles',
  'agents',
  'skills',
  'references',
  'templates',
]);

const ASSET_EXTENSIONS = new Set(['.md', '.tmpl', '.json']);

type RegistryEntry = readonly [relativePath: string, start: number, length: number];

type RuntimeContentRegistry = Readonly<{
  schemaVersion: 1;
  payload: string;
  resources: Record<string, RegistryEntry>;
  agents: Record<string, RegistryEntry>;
  agentProfiles: Record<string, RegistryEntry>;
  blueprints: Record<string, RegistryEntry>;
}>;

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

function readJsonAsset(relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(SRC, relativePath), 'utf8'));
}

function readRegistryEntry(relativePath: string, content = fs.readFileSync(path.join(SRC, relativePath), 'utf8')): RegistryEntry {
  const start = registryPayload.length;
  registryPayload += content;
  return Object.freeze([relativePath, start, content.length] as const);
}

let registryPayload = '';

function readBlueprintEntries(): Record<string, RegistryEntry> {
  const blueprintDir = path.join(SRC, 'templates', 'session-blueprints');
  if (!fs.existsSync(blueprintDir)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readdirSync(blueprintDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry): [string, RegistryEntry] => {
        const id = path.basename(entry.name, '.md');
        return [id, readRegistryEntry(path.join('templates', 'session-blueprints', entry.name))];
      })
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function readAgentProfileEntries(): Record<string, RegistryEntry> {
  const profileDir = path.join(SRC, 'agent-profiles');
  if (!fs.existsSync(profileDir)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readdirSync(profileDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.profile'))
      .map((entry): [string, RegistryEntry] => {
        const id = path.basename(entry.name, '.profile');
        return [id, readRegistryEntry(path.join('agent-profiles', entry.name))];
      })
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function createRuntimeContentRegistry(): RuntimeContentRegistry {
  registryPayload = '';
  const resourceRegistry = readJsonAsset('generated/resource-registry.json');

  const resources = Object.fromEntries(
    Object.entries(resourceRegistry)
      .map(([id, relativePath]) => [id, readRegistryEntry(String(relativePath))])
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
  );

  const agents = Object.fromEntries(
    listAgentSources(SRC)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((source) => [source.name, Object.freeze([source.relativePath, 0, 0] as const)])
  );

  return Object.freeze({
    schemaVersion: 1,
    payload: RUNTIME_CONTENT_PAYLOAD,
    resources,
    agents,
    agentProfiles: readAgentProfileEntries(),
    blueprints: readBlueprintEntries(),
  });
}

function writeRuntimeContentRegistry(): void {
  const targetPath = path.join(DIST_SRC, 'generated', RUNTIME_CONTENT_REGISTRY);
  const payloadPath = path.join(DIST_SRC, 'generated', RUNTIME_CONTENT_PAYLOAD);
  const registry = createRuntimeContentRegistry();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(registry)}\n`);
  fs.writeFileSync(payloadPath, registryPayload);
}

function removeRetiredRuntimeContentRoots(): void {
  for (const relativeRoot of RUNTIME_CONTENT_ROOTS) {
    fs.rmSync(path.join(DIST_SRC, relativeRoot), { recursive: true, force: true });
  }
}

function copyRuntimeAssets(): number {
  removeRetiredRuntimeContentRoots();
  const copied = ASSET_ROOTS.reduce((count, relativeRoot) => count + copyAssetsFrom(relativeRoot), 0);
  writeRuntimeContentRegistry();
  return copied + 2;
}

function isDirectInvocation(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && path.resolve(entrypoint) === moduleFilename);
}

if (isDirectInvocation()) {
  const copied = copyRuntimeAssets();
  console.log(`Copied ${copied} runtime asset files to ${path.relative(ROOT, DIST_SRC)}`);
}

export { ASSET_ROOTS, RUNTIME_CONTENT_ROOTS, createRuntimeContentRegistry, copyRuntimeAssets };
