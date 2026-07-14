import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { renderAgentProfileSources } from '../../core/agent-sources.js';

const agentRegistry = JSON.parse(
  fs.readFileSync(new URL('../../generated/agent-registry.json', import.meta.url), 'utf8')
) as readonly { readonly name: string }[];
const resourceRegistry = JSON.parse(
  fs.readFileSync(new URL('../../generated/resource-registry.json', import.meta.url), 'utf8')
) as Record<string, string>;

const RUNTIME_CONTENT_REGISTRY = 'runtime-content-registry.json';
const RESOURCE_ALLOWLIST = Object.freeze(resourceRegistry);
const RESOURCE_IDS = Object.freeze(Object.keys(RESOURCE_ALLOWLIST));
const AGENT_ALLOWLIST = Object.freeze(agentRegistry.map(({ name }) => name));

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

type RuntimeContentRegistry = Record<string, unknown> & {
  readonly schemaVersion: 2;
  readonly storage: 'file' | 'packed' | 'inline';
};
type Cache<T> = { readonly value: T } | { readonly error: unknown };

function lazy<T>(load: () => T): () => T {
  let cache: Cache<T> | undefined;
  return () => {
    if ('value' in (cache || {})) return (cache as { value: T }).value;
    if (cache && 'error' in cache) throw cache.error;
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

function runtimeContentError(code: string, message: string, filePath: string): Error {
  return Object.assign(new Error(message), { code, path: filePath });
}

function registryPath(srcRoot: string): string {
  return path.join(srcRoot, 'generated', RUNTIME_CONTENT_REGISTRY);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRegistry(srcRoot: string): RuntimeContentRegistry {
  const filePath = registryPath(srcRoot);
  const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isObject(value) || value.schemaVersion !== 2) {
    throw runtimeContentError(
      'ERR_RUNTIME_CONTENT_MANIFEST', 'Runtime content manifest must declare schemaVersion 2', filePath
    );
  }
  if (value.storage !== 'file' && value.storage !== 'packed' && value.storage !== 'inline') {
    throw runtimeContentError(
      'ERR_RUNTIME_CONTENT_STORAGE',
      `Unsupported runtime content storage: ${String(value.storage)}`, filePath
    );
  }
  return value as RuntimeContentRegistry;
}

function isKnownResource(id: string): boolean {
  return Object.hasOwn(RESOURCE_ALLOWLIST, id);
}

function errorValue(error: unknown, key: 'code' | 'path'): unknown {
  return error && typeof error === 'object' && key in error
    ? (error as Record<string, unknown>)[key]
    : undefined;
}

function errorCode(error: unknown): string {
  return String(errorValue(error, 'code') || 'UNKNOWN');
}

function contentReadError(
  label: 'resource' | 'agent',
  id: string,
  fallbackPath: string,
  error: unknown,
  preferErrorPath: boolean
): ContentReadError {
  const code = errorCode(error);
  const errorPath = preferErrorPath ? errorValue(error, 'path') : undefined;
  return {
    error: `Failed to read ${label} "${id}": ${code}`,
    code,
    path: typeof errorPath === 'string' ? errorPath : fallbackPath,
  };
}

function unknownContentError(
  label: 'resource' | 'agent', id: string, knownIds: readonly string[]
): ContentReadError {
  return { error: `Unknown ${label} identifier: "${id}". Known identifiers: ${knownIds.join(', ')}` };
}

function invalidPath(srcRoot: string, value: unknown, code: string, reason: string): Error {
  return runtimeContentError(
    code, `Invalid runtime content path ${JSON.stringify(value)}: ${reason}`, registryPath(srcRoot)
  );
}

function validateRelativePath(value: unknown, srcRoot: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidPath(srcRoot, value, 'ERR_RUNTIME_CONTENT_ENTRY', 'expected a non-empty string');
  }
  if (value.includes('\0')) {
    throw invalidPath(srcRoot, value, 'ERR_RUNTIME_CONTENT_PATH_NUL', 'NUL bytes are not allowed');
  }
  if (value.includes('\\')) {
    throw invalidPath(srcRoot, value, 'ERR_RUNTIME_CONTENT_PATH_BACKSLASH', 'backslashes are not allowed');
  }
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    throw invalidPath(srcRoot, value, 'ERR_RUNTIME_CONTENT_PATH_ABSOLUTE', 'absolute paths are not allowed');
  }
  const segments = value.split('/');
  if (segments.includes('..')) {
    throw invalidPath(srcRoot, value, 'ERR_RUNTIME_CONTENT_PATH_TRAVERSAL', 'parent traversal is not allowed');
  }
  if (segments.some((segment) => !segment || segment === '.')) {
    throw invalidPath(srcRoot, value, 'ERR_RUNTIME_CONTENT_PATH', 'path must be canonical');
  }
  return value;
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  );
}

function resolveFileEntry(srcRoot: string, value: unknown) {
  const relativePath = validateRelativePath(value, srcRoot);
  const absoluteRoot = path.resolve(srcRoot);
  const absolutePath = path.resolve(absoluteRoot, ...relativePath.split('/'));
  if (!isContained(absoluteRoot, absolutePath)) {
    throw runtimeContentError(
      'ERR_RUNTIME_CONTENT_PATH_TRAVERSAL',
      `Runtime content path escapes its canonical root: ${relativePath}`, absolutePath
    );
  }
  const realRoot = fs.realpathSync(absoluteRoot);
  let realPath: string;
  try {
    realPath = fs.realpathSync(absolutePath);
  } catch (error) {
    if (error && typeof error === 'object') Object.assign(error, { path: absolutePath });
    throw error;
  }
  if (!isContained(realRoot, realPath)) {
    throw runtimeContentError(
      'ERR_RUNTIME_CONTENT_PATH_ESCAPE',
      `Runtime content path resolves outside its canonical root: ${relativePath}`, absolutePath
    );
  }
  return { absolutePath, realPath, relativePath };
}

function rawContent(
  srcRoot: string, relativePath: string, content: string, filePath?: string
): RawContent {
  return Object.freeze({
    content,
    path: filePath || path.resolve(srcRoot, ...relativePath.split('/')),
    relativePath,
  });
}

function readFileEntry(srcRoot: string, value: unknown): RawContent {
  const entry = resolveFileEntry(srcRoot, value);
  return rawContent(
    srcRoot,
    entry.relativePath,
    fs.readFileSync(entry.realPath, 'utf8'),
    entry.absolutePath
  );
}

function createInlineEntry(srcRoot: string, entry: unknown): RawContent {
  if (!isObject(entry) || entry.kind !== 'inline' || typeof entry.content !== 'string') {
    throw runtimeContentError(
      'ERR_RUNTIME_CONTENT_ENTRY',
      'Inline runtime content entries require kind, relativePath, and content', registryPath(srcRoot)
    );
  }
  const relativePath = validateRelativePath(entry.relativePath, srcRoot);
  return rawContent(srcRoot, relativePath, entry.content);
}

function createRuntimeContentSnapshot(canonicalSrcRoot: string): RuntimeContentSnapshot {
  const srcRoot = path.resolve(canonicalSrcRoot);
  const filePath = registryPath(srcRoot);
  const registry = lazy(() => readRegistry(srcRoot));
  const payload = lazy(() => {
    const contentRegistry = registry();
    if (contentRegistry.storage !== 'packed') {
      throw runtimeContentError(
        'ERR_RUNTIME_CONTENT_STORAGE',
        `Runtime content payload requested for ${contentRegistry.storage} storage`, filePath
      );
    }
    if (contentRegistry.payloadEncoding !== 'gzip') {
      throw new Error(
        `Unsupported runtime content payload encoding: ${String(contentRegistry.payloadEncoding)}`
      );
    }
    const payloadName = validateRelativePath(contentRegistry.payload, srcRoot);
    const packedFile = resolveFileEntry(srcRoot, path.posix.join('generated', payloadName));
    try {
      return zlib.gunzipSync(fs.readFileSync(packedFile.realPath)).toString('utf8');
    } catch (error) {
      if (error && typeof error === 'object' && !('path' in error)) {
        Object.assign(error, { path: packedFile.absolutePath });
      }
      throw error;
    }
  });

  function sectionEntries(contentRegistry: RuntimeContentRegistry, section: string) {
    const entries = contentRegistry[section];
    if (!isObject(entries)) {
      throw runtimeContentError(
        'ERR_RUNTIME_CONTENT_MANIFEST',
        `Runtime content manifest section "${section}" must be an object`, filePath
      );
    }
    return entries;
  }

  function sectionEntry(
    contentRegistry: RuntimeContentRegistry, section: string, id: string
  ): unknown {
    const entries = sectionEntries(contentRegistry, section);
    return Object.hasOwn(entries, id) ? entries[id] : undefined;
  }

  function materializePackedEntry(entry: unknown): RawContent {
    if (isObject(entry) && entry.kind === 'inline') return createInlineEntry(srcRoot, entry);
    if (
      !Array.isArray(entry) || entry.length !== 3 || typeof entry[0] !== 'string' ||
      !Number.isSafeInteger(entry[1]) || !Number.isSafeInteger(entry[2]) ||
      entry[1] < 0 || entry[2] < 0
    ) {
      throw runtimeContentError(
        'ERR_RUNTIME_CONTENT_ENTRY',
        'Packed runtime content entries require a path and nonnegative safe integer offsets', filePath
      );
    }
    const relativePath = validateRelativePath(entry[0], srcRoot);
    const packedContent = payload();
    const end = entry[1] + entry[2];
    if (!Number.isSafeInteger(end) || end > packedContent.length) {
      throw runtimeContentError(
        'ERR_RUNTIME_CONTENT_RANGE',
        `Packed runtime content range is outside the payload: ${relativePath}`, filePath
      );
    }
    return rawContent(srcRoot, relativePath, packedContent.slice(entry[1], end));
  }

  function materializeEntry(registryValue: RuntimeContentRegistry, entry: unknown): RawContent {
    if (registryValue.storage === 'file') return readFileEntry(srcRoot, entry);
    if (registryValue.storage === 'packed') return materializePackedEntry(entry);
    return createInlineEntry(srcRoot, entry);
  }

  function renderAgentProfiles(registryValue: RuntimeContentRegistry): Map<string, RawContent> {
    const profiles = Object.entries(sectionEntries(registryValue, 'agentProfiles')).map(
      ([id, entry]) => {
        const source = materializeEntry(registryValue, entry);
        return { profilePath: source.relativePath || id, content: source.content };
      }
    );
    const rendered = new Map<string, RawContent>();
    for (const source of renderAgentProfileSources(profiles)) {
      if (!rendered.has(source.name)) {
        rendered.set(source.name, rawContent(srcRoot, source.relativePath, source.content));
      }
    }
    return rendered;
  }

  const storedAgentProfiles = lazy(() => renderAgentProfiles(registry()));
  function agentProfiles(registryValue: RuntimeContentRegistry): Map<string, RawContent> {
    return registryValue.storage === 'file'
      ? renderAgentProfiles(registryValue)
      : storedAgentProfiles();
  }

  function requiredEntry(
    registryValue: RuntimeContentRegistry, section: string, id: string
  ): unknown {
    const entry = sectionEntry(registryValue, section, id);
    if (entry === undefined) throw Object.assign(new Error('Missing content entry'), { code: 'ENOENT' });
    return entry;
  }

  function readKnown(
    label: 'resource' | 'agent',
    id: string,
    knownIds: readonly string[],
    load: (registryValue: RuntimeContentRegistry) => RawContent
  ): RawContent | ContentReadError {
    if (!knownIds.includes(id)) return unknownContentError(label, id, knownIds);
    let registryValue: RuntimeContentRegistry | undefined;
    try {
      registryValue = registry();
      return load(registryValue);
    } catch (error) {
      return contentReadError(label, id, filePath, error, registryValue?.storage === 'file');
    }
  }

  function readResource(id: string): RawContent | ContentReadError {
    return readKnown('resource', id, RESOURCE_IDS, (registryValue) =>
      materializeEntry(registryValue, requiredEntry(registryValue, 'resources', id))
    );
  }

  function readAgent(name: string): RawContent | ContentReadError {
    return readKnown('agent', name, AGENT_ALLOWLIST, (registryValue) =>
      agentProfiles(registryValue).get(name) ||
      materializeEntry(registryValue, requiredEntry(registryValue, 'agents', name))
    );
  }

  function materializeBlueprint(
    registryValue: RuntimeContentRegistry, entry: unknown
  ): RawContent | null {
    try {
      return materializeEntry(registryValue, entry);
    } catch (error) {
      const code = errorCode(error);
      if (
        code === 'ERR_RUNTIME_CONTENT_ENTRY' || code === 'ERR_RUNTIME_CONTENT_RANGE' ||
        (registryValue.storage === 'file' && code === 'ENOENT')
      ) return null;
      throw error;
    }
  }

  function readBlueprint(id: string): RawContent | null {
    const registryValue = registry();
    const entry = sectionEntry(registryValue, 'blueprints', id);
    return entry === undefined ? null : materializeBlueprint(registryValue, entry);
  }

  function listBlueprints(): readonly (RawContent & { readonly id: string })[] {
    const registryValue = registry();
    return Object.freeze(
      Object.entries(sectionEntries(registryValue, 'blueprints'))
        .flatMap(([id, entry]) => {
          const blueprint = materializeBlueprint(registryValue, entry);
          return blueprint ? [Object.freeze({ id, ...blueprint })] : [];
        })
        .sort((left, right) => left.id.localeCompare(right.id))
    );
  }

  return Object.freeze({ srcRoot, readResource, readAgent, readBlueprint, listBlueprints });
}

export { AGENT_ALLOWLIST, RESOURCE_ALLOWLIST, createRuntimeContentSnapshot, isKnownResource };
export type { ContentReadError, RawContent, RuntimeContentSnapshot };
