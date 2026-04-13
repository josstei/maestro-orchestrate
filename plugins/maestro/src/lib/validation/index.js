'use strict';

const fs = require('fs');
const path = require('path');
const { ValidationError } = require('../errors');

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * @param {*} value
 * @param {string} label
 * @throws {ValidationError}
 */
function assertNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`${label} must be a non-empty array`, {
      details: { value, label },
    });
  }
}

/**
 * @param {*} id
 * @throws {ValidationError}
 */
function assertSessionId(id) {
  if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) {
    throw new ValidationError(
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+',
      { details: { value: id } }
    );
  }
}

/**
 * @param {string|string[]} value
 * @param {string[]|Record<string, *>} allowlist
 * @param {string} label
 * @throws {ValidationError}
 */
function assertAllowlisted(value, allowlist, label) {
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
 * @param {string} p
 * @throws {ValidationError}
 */
function assertRelativePath(p) {
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
 * @param {string} p
 * @param {string} base
 * @throws {ValidationError}
 */
function assertContainedIn(p, base) {
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

module.exports = {
  assertNonEmptyArray,
  assertSessionId,
  assertAllowlisted,
  assertRelativePath,
  assertContainedIn,
};
