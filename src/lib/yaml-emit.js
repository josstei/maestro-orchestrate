'use strict';

/**
 * Minimal YAML fragment emitters used by the generator.
 *
 * The list emitters do not escape their inputs — callers MUST pass
 * YAML-safe scalars (identifiers, numbers, or strings pre-escaped with
 * escapeYaml). Values containing `:`, `"`, `\`, or leading/trailing
 * whitespace will produce invalid YAML.
 *
 * The generator passes agent names, skill names, and reference
 * names — all controlled inputs from the canonical source tree — so
 * the raw interpolation is safe in practice.
 */

/**
 * Emit a block-style list under `key`. Returns [] when the list is
 * empty so callers can append without producing an orphaned `key:`
 * line.
 */
function emitBlockList(key, items) {
  if (!items || items.length === 0) return [];
  return [`${key}:`, ...items.map((item) => `  - ${item}`)];
}

/**
 * Emit an inline comma-separated list of double-quoted scalars.
 * Intended for embedding inside flow-style arrays like `[...]`.
 */
function emitInlineQuotedList(items) {
  return items.map((item) => `"${item}"`).join(', ');
}

/**
 * Escape special characters in a YAML string value.
 *
 * Escapes backslashes and double quotes for safe embedding inside a
 * double-quoted YAML scalar. Non-string inputs are coerced via String().
 *
 * @param {string} value - Value to escape.
 * @returns {string} Escaped value safe for double-quoted YAML context.
 */
function escapeYaml(value) {
  if (typeof value !== 'string') return String(value);
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

module.exports = {
  emitBlockList,
  emitInlineQuotedList,
  escapeYaml,
};
