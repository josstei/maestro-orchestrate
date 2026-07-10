import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { listAgentSources } from '../core/agent-sources.js';
import { buildRegistryModel, collectRegistryOutputs } from '../generator/registry-scanner.js';
import type { RegistryModel } from '../generator/types.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../../..');
const SRC = path.join(ROOT, 'src');
const DIST_SRC = path.join(ROOT, 'dist', 'src');
const RUNTIME_CONTENT_REGISTRY = 'runtime-content-registry.json';
const RUNTIME_CONTENT_PAYLOAD = 'runtime-content-registry.txt.gz';

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

type RegistryEntry = readonly [relativePath: string, start: number, length: number];

type RuntimeContentRegistry = Readonly<{
  schemaVersion: 1;
  payload: string;
  payloadEncoding: 'gzip';
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

function createRuntimeContentRegistry(model: RegistryModel): RuntimeContentRegistry {
  registryPayload = '';

  const resources = Object.fromEntries(
    Object.entries(model.resources)
      .map(([id, relativePath]) => [id, readRegistryEntry(relativePath)])
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
  );

  const agentSources = listAgentSources(SRC);
  if (agentSources.length !== model.agents.length) {
    throw new Error('Registry model agent count does not match tracked agent sources');
  }
  const agents = Object.fromEntries(
    model.agents
      .map((agent, index) => {
        const source = agentSources[index];
        if (!source) {
          throw new Error(`Registry model agent "${agent.name}" is missing tracked source content`);
        }
        return [agent.name, Object.freeze([source.relativePath, 0, 0] as const)] as const;
      })
      .sort(([a], [b]) => a.localeCompare(b))
  );

  return Object.freeze({
    schemaVersion: 1,
    payload: RUNTIME_CONTENT_PAYLOAD,
    payloadEncoding: 'gzip',
    resources,
    agents,
    agentProfiles: readAgentProfileEntries(),
    blueprints: readBlueprintEntries(),
  });
}

function writeRuntimeContentRegistry(model: RegistryModel): void {
  const targetPath = path.join(DIST_SRC, 'generated', RUNTIME_CONTENT_REGISTRY);
  const payloadPath = path.join(DIST_SRC, 'generated', RUNTIME_CONTENT_PAYLOAD);
  const registry = createRuntimeContentRegistry(model);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(registry)}\n`);
  fs.writeFileSync(payloadPath, gzipSync(registryPayload, { level: 9 }));
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
  return Boolean(entrypoint && path.resolve(entrypoint) === moduleFilename);
}

if (isDirectInvocation()) {
  const copied = copyRuntimeAssets();
  console.log(`Copied ${copied} runtime asset files to ${path.relative(ROOT, DIST_SRC)}`);
}

export { ASSET_ROOTS, RUNTIME_CONTENT_ROOTS, createRuntimeContentRegistry, copyRuntimeAssets };
