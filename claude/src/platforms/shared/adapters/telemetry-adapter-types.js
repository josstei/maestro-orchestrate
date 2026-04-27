'use strict';

/**
 * Canonical Usage shape for runtime telemetry. Mirrors the existing
 * `transition_phase` `token_usage` parameter (see
 * `src/mcp/tool-packs/session/index.js` and the totals accumulator in
 * `src/mcp/handlers/session-state-tools.js`) so adapter outputs flow
 * directly into the session-state aggregator without translation.
 *
 * Field meaning:
 * - `input`   — non-cached input tokens billed for the invocation
 * - `output`  — output tokens billed for the invocation
 * - `cached`  — cached/cache-read input tokens (treated as a separate
 *               bucket since pricing differs per runtime)
 *
 * Adapter authors MUST normalize runtime-specific names (e.g.
 * `prompt_tokens`, `cache_read_input_tokens`) into these three keys.
 */
const TELEMETRY_USAGE_FIELDS = Object.freeze(['input', 'output', 'cached']);

const ZERO_USAGE = Object.freeze({ input: 0, output: 0, cached: 0 });

/**
 * Runtime discriminator values recognized by the telemetry-adapter
 * factory. Defined as a frozen array so a contributor adding a fifth
 * runtime updates exactly one location.
 */
const TELEMETRY_RUNTIMES = Object.freeze(['claude', 'codex', 'gemini', 'qwen']);

/**
 * Strict shape check for a Usage object: must be a non-array object
 * containing every required field with a numeric value. Adapters that
 * cannot extract usage MUST return `ZERO_USAGE` rather than partial
 * objects so this predicate stays a useful invariant.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isTelemetryUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return TELEMETRY_USAGE_FIELDS.every(
    (field) =>
      Object.prototype.hasOwnProperty.call(value, field) &&
      typeof value[field] === 'number'
  );
}

module.exports = {
  TELEMETRY_USAGE_FIELDS,
  TELEMETRY_RUNTIMES,
  ZERO_USAGE,
  isTelemetryUsage,
};
