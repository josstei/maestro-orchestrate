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

/** Escape \ and " for a double-quoted YAML scalar; a non-string is returned as String(value). */
function escapeYaml(value) {
  if (typeof value !== 'string') return String(value);
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

module.exports = {
  emitBlockList,
  emitInlineQuotedList,
  escapeYaml,
};
