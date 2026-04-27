'use strict';

const {
  defineTelemetryAdapter,
} = require('../shared/adapters/telemetry-adapter-factory');
const {
  ZERO_USAGE,
} = require('../shared/adapters/telemetry-adapter-types');

/**
 * Claude (Anthropic SDK) Usage envelope keys at the time of writing:
 *   - input_tokens                — non-cached input
 *   - output_tokens               — output
 *   - cache_read_input_tokens     — cached prompt prefix tokens
 *   - cache_creation_input_tokens — tokens written to the cache
 *
 * Both cache buckets contribute to the canonical `cached` total because
 * pricing differs from non-cached input but they share the cache-related
 * lifecycle. Adapter output flows directly into transition_phase's
 * token_usage parameter — no further translation in the orchestrator.
 *
 * @param {object} invocationResult
 * @returns {{input: number, output: number, cached: number}}
 */
function extractUsage(invocationResult) {
  const usage = invocationResult && invocationResult.usage;
  if (!usage || typeof usage !== 'object') return ZERO_USAGE;
  const cacheRead = Number(usage.cache_read_input_tokens) || 0;
  const cacheCreation = Number(usage.cache_creation_input_tokens) || 0;
  return {
    input: Number(usage.input_tokens) || 0,
    output: Number(usage.output_tokens) || 0,
    cached: cacheRead + cacheCreation,
  };
}

function isAvailable(invocationResult) {
  return Boolean(invocationResult && invocationResult.usage);
}

module.exports = defineTelemetryAdapter({
  runtime: 'claude',
  extractUsage,
  isAvailable,
});
