import fs from 'node:fs';
import path from 'node:path';
import { ValidationError } from '../errors/index.js';
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * @throws {ValidationError}
 */
function assertNonEmptyArray(value: unknown, label: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`${label} must be a non-empty array`, {
      details: { value, label },
    });
  }
}

/**
 * @throws {ValidationError}
 */
function assertSessionId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) {
    throw new ValidationError(
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+',
      { details: { value: id } }
    );
  }
}

/**
 * @throws {ValidationError}
 */
function assertAllowlisted(
  value: string | readonly string[],
  allowlist: readonly string[] | Readonly<Record<string, unknown>>,
  label: string
): void {
  const entries = Array.isArray(value) ? value : [value];
  const permitted = Array.isArray(allowlist) ? allowlist : Object.keys(allowlist);
  const invalid = entries.filter((entry) => !permitted.includes(entry));

  if (invalid.length > 0) {
    throw new ValidationError(
      `Unknown ${label}: ${invalid.map((v) => `"${v}"`).join(', ')}. Known identifiers: ${permitted.join(', ')}`,
      { details: { invalid, permitted, label } }
    );
  }
}

/**
 * @throws {ValidationError}
 */
function assertRelativePath(p: unknown): asserts p is string {
  if (typeof p !== 'string') {
    throw new ValidationError('Path must be a string', {
      details: { value: p },
    });
  }

  if (p.includes('\0')) {
    throw new ValidationError('Path contains null bytes', {
      details: { value: p },
    });
  }

  if (path.isAbsolute(p)) {
    throw new ValidationError('Path must be relative', {
      details: { value: p },
    });
  }

  const segments = p.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new ValidationError('Path traversal not allowed', {
      details: { value: p },
    });
  }
}

/**
 * @throws {ValidationError}
 */
function assertContainedIn(p: string, base: string): void {
  let resolved = path.resolve(p);
  let resolvedBase = path.resolve(base);

  try { resolved = fs.realpathSync(resolved); } catch {}
  try { resolvedBase = fs.realpathSync(resolvedBase); } catch {}

  const basePrefix = resolvedBase + path.sep;

  if (!resolved.startsWith(basePrefix) && resolved !== resolvedBase) {
    throw new ValidationError('Path escapes base directory', {
      details: { path: resolved, base: resolvedBase },
    });
  }
}

/**
 * @throws {ValidationError}
 */
function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  return trimmed;
}

/**
 */
function coercePositiveInteger(value: unknown): unknown {
  if (value == null || typeof value === 'number') return value;
  if (typeof value !== 'string') return value;
  const num = Number(value);
  return Number.isFinite(num) && Number.isInteger(num) && num > 0 ? num : value;
}

/**
 * Coerce an arbitrary value into a trimmed, de-duplicated, insertion-ordered
 * array of non-empty strings. Non-array input yields [].
 */
function normalizeUniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export { assertNonEmptyArray, assertSessionId, assertAllowlisted, assertRelativePath, assertContainedIn, coercePositiveInteger, requireNonEmptyString, normalizeUniqueStringList };
