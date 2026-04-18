'use strict';

/**
 * Canonical downstream-context contract.
 *
 * The handoff between orchestrator and child agents is documented (in
 * agent-base-protocol) as a five-field structure. Agents may emit each field as
 * either a string (`"none"`, `"X uses Y"`) or an array of strings. The canonical
 * storage shape is an array of strings; normalization here is the single source
 * of truth used by every handler that reads, writes, or validates the context.
 *
 * Strings and the tokens `"none"` / `"n/a"` / empty strings are all treated as
 * absent so agent protocol examples like `"or none"` don't produce phantom
 * entries in session state.
 */

const CANONICAL_FIELDS = Object.freeze([
  'key_interfaces_introduced',
  'patterns_established',
  'integration_points',
  'assumptions',
  'warnings',
]);

const EMPTY_VALUE_TOKENS = new Set(['', 'none', 'n/a', 'not applicable']);

function isEmptyValueToken(value) {
  return EMPTY_VALUE_TOKENS.has(String(value).trim().toLowerCase());
}

function normalizeFieldValue(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && !isEmptyValueToken(item));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0 || isEmptyValueToken(trimmed)) return [];
    return [trimmed];
  }
  return [];
}

/**
 * @returns {Object<string, string[]>} a fresh empty canonical context.
 */
function createEmptyDownstreamContext() {
  const empty = {};
  for (const field of CANONICAL_FIELDS) {
    empty[field] = [];
  }
  return empty;
}

/**
 * Normalize any input to the canonical `{ field: string[] }` shape.
 * Accepts null, arrays-of-strings, strings, and unknown keys are dropped.
 *
 * @param {unknown} input
 * @returns {Object<string, string[]>}
 */
function normalizeDownstreamContext(input) {
  const normalized = createEmptyDownstreamContext();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return normalized;
  }
  for (const field of CANONICAL_FIELDS) {
    normalized[field] = normalizeFieldValue(input[field]);
  }
  return normalized;
}

/**
 * True when the normalized context has at least one non-empty field.
 * @param {unknown} input
 * @returns {boolean}
 */
function isDownstreamContextPopulated(input) {
  const normalized = normalizeDownstreamContext(input);
  return CANONICAL_FIELDS.some((field) => normalized[field].length > 0);
}

/**
 * Human-readable description of the contract, suitable for embedding in error
 * messages so callers can adapt without reading source.
 * @returns {string}
 */
function describeShape() {
  return (
    'downstream_context must contain at least one of: ' +
    CANONICAL_FIELDS.join(', ') +
    '. Each field accepts a non-empty string or a non-empty array of strings. ' +
    'Empty strings and the tokens "none" / "n/a" / "not applicable" are treated as absent.'
  );
}

module.exports = {
  CANONICAL_FIELDS,
  createEmptyDownstreamContext,
  normalizeDownstreamContext,
  isDownstreamContextPopulated,
  describeShape,
};
