'use strict';

const {
  defineTelemetryAdapter,
} = require('../shared/adapters/telemetry-adapter-factory');
const {
  ZERO_USAGE,
} = require('../shared/adapters/telemetry-adapter-types');

/**
 * Qwen telemetry stub.
 *
 * Qwen Code shares the Gemini CLI architecture and exposes the same
 * minimal `invoke_agent` result envelope (no usage block). Same
 * follow-up candidates apply: debug log scraping or model-side
 * usageMetadata capture via a fork.
 *
 * Until a real source is identified, this adapter reports zero usage and
 * `isAvailable: false`. Per orchestration-steps step 25, an unavailable
 * adapter signals the orchestrator to OMIT `token_usage` from
 * `transition_phase` rather than recording zeros.
 */
module.exports = defineTelemetryAdapter({
  runtime: 'qwen',
  extractUsage: () => ZERO_USAGE,
  isAvailable: () => false,
});
