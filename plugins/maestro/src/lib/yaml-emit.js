'use strict';

/**
 * Minimal YAML fragment emitters used by the generator.
 *
 * Neither function escapes its inputs — callers MUST pass YAML-safe
 * scalars (identifiers, numbers, or pre-escaped strings). Values
 * containing `:`, `"`, `\`, or leading/trailing whitespace will
 * produce invalid YAML.
 *
 * Current callers (entry-point-expander, preamble-builders) pass
 * agent names, skill names, and reference names — all controlled
 * inputs from the canonical source tree — so the raw interpolation
 * is safe in practice.
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

module.exports = {
  emitBlockList,
  emitInlineQuotedList,
};
