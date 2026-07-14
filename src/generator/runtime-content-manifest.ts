import fs from 'node:fs';
import path from 'node:path';
import { validateRegistry } from './registry-schemas.js';
import type { GeneratedOutput, RegistryModel } from './types.js';

const RUNTIME_CONTENT_REGISTRY = 'runtime-content-registry.json';
const RUNTIME_CONTENT_PAYLOAD = 'runtime-content-registry.txt.gz';

type RuntimeContentSections<T> = Readonly<{
  resources: Readonly<Record<string, T>>;
  agents: Readonly<Record<string, T>>;
  agentProfiles: Readonly<Record<string, T>>;
  blueprints: Readonly<Record<string, T>>;
}>;
type RuntimeContentManifest = RuntimeContentSections<string>;
type PackedRuntimeContentEntry = readonly [relativePath: string, start: number, length: number];
type PackedRuntimeContentRegistry = RuntimeContentSections<PackedRuntimeContentEntry> & Readonly<{
  schemaVersion: 2;
  storage: 'packed';
  payload: typeof RUNTIME_CONTENT_PAYLOAD;
  payloadEncoding: 'gzip';
}>;

function sortedRecord(entries: readonly (readonly [string, string])[]) {
  return Object.freeze(Object.fromEntries(
    [...entries].sort(([left], [right]) => left.localeCompare(right))
  ));
}

function listFiles(srcRoot: string, relativeDir: string, extension: string) {
  const absoluteDir = path.join(srcRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return Object.freeze({});
  }

  return sortedRecord(
    fs.readdirSync(absoluteDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
      .map((entry) => [
        path.basename(entry.name, extension),
        path.posix.join(relativeDir, entry.name),
      ] as const)
  );
}

function createRuntimeContentManifest(
  srcRoot: string,
  model: RegistryModel
): RuntimeContentManifest {
  return Object.freeze({
    resources: sortedRecord(Object.entries(model.resources)),
    agents: listFiles(srcRoot, 'agents', '.md'),
    agentProfiles: listFiles(srcRoot, 'agent-profiles', '.profile'),
    blueprints: listFiles(srcRoot, 'templates/session-blueprints', '.md'),
  });
}

function createFileRuntimeContentRegistry(
  manifest: RuntimeContentManifest
) {
  const registry = Object.freeze({
    schemaVersion: 2 as const,
    storage: 'file' as const,
    ...manifest,
  });
  validateRegistry(RUNTIME_CONTENT_REGISTRY, registry);
  return registry;
}

function createPackedRuntimeContentRegistry(
  srcRoot: string,
  manifest: RuntimeContentManifest
): Readonly<{ registry: PackedRuntimeContentRegistry; payload: string }> {
  let payload = '';

  function packSection(section: Readonly<Record<string, string>>) {
    return Object.freeze(Object.fromEntries(
      Object.entries(section).map(([id, relativePath]) => {
        const content = fs.readFileSync(path.join(srcRoot, relativePath), 'utf8');
        const entry = Object.freeze([
          relativePath,
          payload.length,
          content.length,
        ] as const);
        payload += content;
        return [id, entry] as const;
      })
    ));
  }

  const registry = Object.freeze({
    schemaVersion: 2 as const,
    storage: 'packed' as const,
    payload: RUNTIME_CONTENT_PAYLOAD,
    payloadEncoding: 'gzip' as const,
    resources: packSection(manifest.resources),
    agents: packSection(manifest.agents),
    agentProfiles: packSection(manifest.agentProfiles),
    blueprints: packSection(manifest.blueprints),
  });
  validateRegistry(RUNTIME_CONTENT_REGISTRY, registry);
  return Object.freeze({ registry, payload });
}

function createFileRuntimeContentOutput(
  srcRoot: string,
  model: RegistryModel
): GeneratedOutput {
  const manifest = createRuntimeContentManifest(srcRoot, model);
  const registry = createFileRuntimeContentRegistry(manifest);
  return {
    outputPath: path.posix.join('src', 'generated', RUNTIME_CONTENT_REGISTRY),
    content: `${JSON.stringify(registry, null, 2)}\n`,
  };
}

export {
  RUNTIME_CONTENT_PAYLOAD,
  RUNTIME_CONTENT_REGISTRY,
  createFileRuntimeContentOutput,
  createPackedRuntimeContentRegistry,
  createRuntimeContentManifest,
};
