import fs, { readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { renderAgentProfileSources } from '../../core/agent-sources.js';

const agentRegistry = JSON.parse(
  readFileSync(new URL('../../generated/agent-registry.json', import.meta.url), 'utf8')
) as readonly { readonly name: string }[];

const resourceRegistry = JSON.parse(
  readFileSync(new URL('../../generated/resource-registry.json', import.meta.url), 'utf8')
) as Record<string, string>;

const RUNTIME_CONTENT_REGISTRY = 'runtime-content-registry.json';
const DEFAULT_RUNTIME_CONTENT_PAYLOAD = 'runtime-content-registry.txt';
const RESOURCE_ALLOWLIST = Object.freeze(resourceRegistry);
const RESOURCE_IDS = Object.freeze(Object.keys(RESOURCE_ALLOWLIST));
const AGENT_ALLOWLIST = Object.freeze(agentRegistry.map((entry) => entry.name));

interface RawContent {
  readonly content: string;
  readonly path: string;
  readonly relativePath: string;
}

interface ContentReadError {
  readonly error: string;
  readonly code?: string;
  readonly path?: string;
}

interface RuntimeContentSnapshot {
  readonly srcRoot: string;
  readResource(id: string): RawContent | ContentReadError;
  readAgent(name: string): RawContent | ContentReadError;
  readBlueprint(id: string): RawContent | null;
  listBlueprints(): readonly (RawContent & { readonly id: string })[];
}

type RuntimeContentRegistry = Record<string, any>;
type Cache<T> =
  | { readonly value: T }
  | { readonly error: unknown };

function lazy<T>(load: () => T): () => T {
  let cache: Cache<T> | undefined;
  return () => {
    if (cache) {
      if ('error' in cache) throw cache.error;
      return cache.value;
    }

    try {
      const value = load();
      cache = { value };
      return value;
    } catch (error) {
      cache = { error };
      throw error;
    }
  };
}

function runtimeContentRegistryPath(srcRoot: string): string {
  return path.join(srcRoot, 'generated', RUNTIME_CONTENT_REGISTRY);
}

function hasRuntimeContentRegistry(srcRoot: string): boolean {
  return fs.existsSync(runtimeContentRegistryPath(srcRoot));
}

function readRuntimeContentRegistry(srcRoot: string): RuntimeContentRegistry {
  return JSON.parse(fs.readFileSync(runtimeContentRegistryPath(srcRoot), 'utf8'));
}

function isKnownResource(id: string): boolean {
  return Object.hasOwn(RESOURCE_ALLOWLIST, id);
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { readonly code?: unknown }).code;
    if (code) {
      return String(code);
    }
  }
  return 'UNKNOWN';
}

function contentReadError(
  label: 'resource' | 'agent',
  id: string,
  registryPath: string,
  code: string
): ContentReadError {
  return {
    error: `Failed to read ${label} "${id}": ${code}`,
    code,
    path: registryPath,
  };
}

function unknownContentError(
  label: 'resource' | 'agent',
  id: string,
  knownIds: readonly string[]
): ContentReadError {
  return {
    error: `Unknown ${label} identifier: "${id}". Known identifiers: ${knownIds.join(', ')}`,
  };
}

function createRuntimeContentSnapshot(canonicalSrcRoot: string): RuntimeContentSnapshot {
  const srcRoot = canonicalSrcRoot;
  const registryPath = runtimeContentRegistryPath(srcRoot);
  const registry = lazy(() => readRuntimeContentRegistry(srcRoot));
  const payload = lazy(() => {
    const contentRegistry = registry();
    const payloadName = contentRegistry.payload || DEFAULT_RUNTIME_CONTENT_PAYLOAD;
    const rawPayload = fs.readFileSync(
      path.join(srcRoot, 'generated', payloadName as string)
    );

    if (contentRegistry.payloadEncoding === 'gzip') {
      return zlib.gunzipSync(rawPayload).toString('utf8');
    }
    if (contentRegistry.payloadEncoding && contentRegistry.payloadEncoding !== 'utf8') {
      throw new Error(
        `Unsupported runtime content payload encoding: ${contentRegistry.payloadEncoding}`
      );
    }
    return rawPayload.toString('utf8');
  });

  function materializeEntry(entry: unknown): RawContent | null {
    if (
      entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      'content' in entry &&
      'relativePath' in entry &&
      typeof (entry as { readonly content?: unknown }).content === 'string' &&
      typeof (entry as { readonly relativePath?: unknown }).relativePath === 'string'
    ) {
      const inlineEntry = entry as { readonly content: string; readonly relativePath: string };
      return Object.freeze({
        content: inlineEntry.content,
        path: path.join(srcRoot, inlineEntry.relativePath),
        relativePath: inlineEntry.relativePath,
      });
    }

    if (
      Array.isArray(entry) &&
      typeof entry[0] === 'string' &&
      typeof entry[1] === 'number' &&
      typeof entry[2] === 'number'
    ) {
      const packedContent = payload();
      return Object.freeze({
        content: packedContent.slice(entry[1], entry[1] + entry[2]),
        path: path.join(srcRoot, entry[0]),
        relativePath: entry[0],
      });
    }

    return null;
  }

  function sectionEntry(
    contentRegistry: RuntimeContentRegistry,
    section: string,
    id: string
  ): unknown {
    const entries = contentRegistry[section];
    return entries && entries[id];
  }

  const agentProfiles = lazy(() => {
    const contentRegistry = registry();
    const profiles = contentRegistry.agentProfiles
      ? Object.entries(contentRegistry.agentProfiles)
        .map(([id, entry]) => {
          const materialized = materializeEntry(entry);
          return materialized
            ? { profilePath: materialized.relativePath || id, content: materialized.content }
            : null;
        })
        .filter((profile): profile is { profilePath: string; content: string } => Boolean(profile))
      : [];
    const value = new Map<string, RawContent>();
    for (const source of renderAgentProfileSources(profiles)) {
      if (value.has(source.name)) {
        continue;
      }
      value.set(source.name, Object.freeze({
        content: source.content,
        path: path.join(srcRoot, source.relativePath),
        relativePath: source.relativePath,
      }));
    }
    return value;
  });

  function readResource(id: string): RawContent | ContentReadError {
    if (!isKnownResource(id)) {
      return unknownContentError('resource', id, RESOURCE_IDS);
    }

    try {
      const contentRegistry = registry();
      const resource = materializeEntry(
        sectionEntry(contentRegistry, 'resources', id)
      );
      return resource || contentReadError('resource', id, registryPath, 'ENOENT');
    } catch (error) {
      return contentReadError('resource', id, registryPath, errorCode(error));
    }
  }

  function readAgent(name: string): RawContent | ContentReadError {
    if (!AGENT_ALLOWLIST.includes(name)) {
      return unknownContentError('agent', name, AGENT_ALLOWLIST);
    }

    try {
      const contentRegistry = registry();
      const profiledAgent = agentProfiles().get(name);
      if (profiledAgent) {
        return profiledAgent;
      }

      const agent = materializeEntry(
        sectionEntry(contentRegistry, 'agents', name)
      );
      return agent || contentReadError('agent', name, registryPath, 'ENOENT');
    } catch (error) {
      return contentReadError('agent', name, registryPath, errorCode(error));
    }
  }

  function readBlueprint(id: string): RawContent | null {
    const contentRegistry = registry();
    const entry = sectionEntry(contentRegistry, 'blueprints', id);
    if (entry == null) {
      return null;
    }

    return materializeEntry(entry);
  }

  function listBlueprints(): readonly (RawContent & { readonly id: string })[] {
    const contentRegistry = registry();
    return Object.freeze(
      Object.entries(contentRegistry.blueprints || {})
        .map(([id, entry]) => {
          const blueprint = materializeEntry(entry);
          return blueprint ? Object.freeze({ id, ...blueprint }) : null;
        })
        .filter((blueprint): blueprint is RawContent & { readonly id: string } => Boolean(blueprint))
        .sort((a, b) => a.id.localeCompare(b.id))
    );
  }

  return Object.freeze({ srcRoot, readResource, readAgent, readBlueprint, listBlueprints });
}

export {
  AGENT_ALLOWLIST,
  RESOURCE_ALLOWLIST,
  createRuntimeContentSnapshot,
  hasRuntimeContentRegistry,
  isKnownResource,
  readRuntimeContentRegistry,
  runtimeContentRegistryPath,
};
export type { ContentReadError, RawContent, RuntimeContentSnapshot };
