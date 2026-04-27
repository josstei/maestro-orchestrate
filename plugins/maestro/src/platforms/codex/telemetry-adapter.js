'use strict';

const {
  defineTelemetryAdapter,
} = require('../shared/adapters/telemetry-adapter-factory');
const {
  ZERO_USAGE,
} = require('../shared/adapters/telemetry-adapter-types');

/**
 * Codex Usage envelope mirrors the OpenAI Chat Completions schema:
 *   - prompt_tokens     (preferred) / input_tokens     (fallback)
 *   - completion_tokens (preferred) / output_tokens    (fallback)
 *   - cached_tokens                                    (cache-read bucket)
 *
 * Falling back covers older Codex CLI versions that surfaced
 * input_tokens/output_tokens directly. cached_tokens is treated as a
 * single bucket because Codex does not expose cache-creation separately.
 *
 * @param {object} invocationResult
 * @returns {{input: number, output: number, cached: number}}
 */
function extractUsage(invocationResult) {
  const usage = invocationResult && invocationResult.usage;
  if (!usage || typeof usage !== 'object') return ZERO_USAGE;
  const input = usage.prompt_tokens != null ? usage.prompt_tokens : usage.input_tokens;
  const output =
    usage.completion_tokens != null ? usage.completion_tokens : usage.output_tokens;
  return {
    input: Number(input) || 0,
    output: Number(output) || 0,
    cached: Number(usage.cached_tokens) || 0,
  };
}

function isAvailable(invocationResult) {
  return Boolean(invocationResult && invocationResult.usage);
}

module.exports = defineTelemetryAdapter({
  runtime: 'codex',
  extractUsage,
  isAvailable,
});
