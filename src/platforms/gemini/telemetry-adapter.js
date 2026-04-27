'use strict';

const {
  defineTelemetryAdapter,
} = require('../shared/adapters/telemetry-adapter-factory');
const {
  ZERO_USAGE,
} = require('../shared/adapters/telemetry-adapter-types');

/**
 * Gemini telemetry stub.
 *
 * The Gemini CLI's `invoke_agent` result envelope returns only the
 * agent's textual output — no usage block. Candidate sources to
 * investigate as a follow-up:
 *   - `--debug` log output (line-prefix scraping)
 *   - GOOGLE_API_LOG / `~/.gemini/history/` (raw API call logs, if enabled)
 *   - Forking `invoke_agent` to capture model-side `usageMetadata`
 *
 * Until a real source is identified, this adapter reports zero usage and
 * `isAvailable: false`. Per orchestration-steps step 25, an unavailable
 * adapter signals the orchestrator to OMIT `token_usage` from
 * `transition_phase` rather than recording zeros.
 */
module.exports = defineTelemetryAdapter({
  runtime: 'gemini',
  extractUsage: () => ZERO_USAGE,
  isAvailable: () => false,
});
