import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface ClientRoot {
  readonly uri?: unknown;
}

interface WorkspaceCandidateOptions {
  readonly rejectExtensionCache?: boolean;
  readonly exists?: (candidate: string) => boolean;
}

const CACHE_PATH_SEGMENTS = [
  path.join('.codex', 'plugins'),
  path.join('.claude', 'plugins'),
  path.join('.gemini', 'extensions'),
];

function isPlaceholderPath(value: unknown): boolean {
  return typeof value === 'string' && value.includes('${');
}

function parseFileRootCandidate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'file:' ? fileURLToPath(parsed) : null;
  } catch {
    return null;
  }
}

function extractClientRootCandidates(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const candidates: string[] = [];
  for (const clientRoot of value) {
    const uri =
      typeof clientRoot === 'string'
        ? clientRoot
        : typeof clientRoot === 'object' && clientRoot !== null && 'uri' in clientRoot
          ? (clientRoot as ClientRoot).uri
          : null;
    const candidate = parseFileRootCandidate(uri);
    if (candidate !== null) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function segmentWindows(segments: readonly string[], size: number): string[] {
  const windows = [];
  for (let index = 0; index <= segments.length - size; index += 1) {
    windows.push(segments.slice(index, index + size).join(path.sep));
  }
  return windows;
}

function isExtensionCachePath(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  const segments = path
    .resolve(value)
    .split(path.sep)
    .filter((segment) => segment.length > 0);
  const windows = segmentWindows(segments, 2);
  return CACHE_PATH_SEGMENTS.some((cacheSegment) => windows.includes(cacheSegment));
}

function normalizeExistingWorkspaceCandidate(
  candidate: unknown,
  options: WorkspaceCandidateOptions = {},
): string | null {
  if (
    typeof candidate !== 'string' ||
    candidate.length === 0 ||
    isPlaceholderPath(candidate)
  ) {
    return null;
  }

  const resolved = path.resolve(candidate);
  const exists = options.exists ?? fs.existsSync;
  if (!exists(resolved)) {
    return null;
  }
  if (options.rejectExtensionCache && isExtensionCachePath(resolved)) {
    return null;
  }
  return resolved;
}

export {
  CACHE_PATH_SEGMENTS,
  extractClientRootCandidates,
  isExtensionCachePath,
  isPlaceholderPath,
  normalizeExistingWorkspaceCandidate,
  parseFileRootCandidate,
};
export type { ClientRoot, WorkspaceCandidateOptions };
