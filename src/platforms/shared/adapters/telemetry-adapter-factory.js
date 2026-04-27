'use strict';

const {
  TELEMETRY_RUNTIMES,
  ZERO_USAGE,
  isTelemetryUsage,
} = require('./telemetry-adapter-types');

/**
 * TelemetryAdapter contract: a single object exposing the per-runtime
 * extraction surface the orchestrator uses to feed `transition_phase`'s
 * `token_usage` parameter.
 *
 * Spec fields:
 * - `runtime` (string)            — discriminator from TELEMETRY_RUNTIMES.
 * - `extractUsage(invocationResult)` — returns a canonical Usage object
 *                                     (input/output/cached) or ZERO_USAGE
 *                                     when the runtime cannot report.
 * - `isAvailable(invocationResult)`  — predicate for whether the runtime
 *                                     supplied usage. False signals the
 *                                     orchestrator to OMIT `token_usage`
 *                                     rather than recording zeros.
 *
 * The factory enforces the contract shape (typed runtime, function
 * signatures, defensive ZERO_USAGE fallback) so adapter authors only
 * declare the runtime-specific extraction.
 */
function defineTelemetryAdapter(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new TypeError(
      'defineTelemetryAdapter: spec must be an object'
    );
  }
  if (typeof spec.runtime !== 'string' || !TELEMETRY_RUNTIMES.includes(spec.runtime)) {
    throw new TypeError(
      `defineTelemetryAdapter: runtime must be one of ${TELEMETRY_RUNTIMES.join(', ')}; received '${spec.runtime}'`
    );
  }
  if (typeof spec.extractUsage !== 'function') {
    throw new TypeError(
      `defineTelemetryAdapter(${spec.runtime}): extractUsage must be a function`
    );
  }
  if (typeof spec.isAvailable !== 'function') {
    throw new TypeError(
      `defineTelemetryAdapter(${spec.runtime}): isAvailable must be a function`
    );
  }

  return {
    runtime: spec.runtime,
    extractUsage(invocationResult) {
      const usage = spec.extractUsage(invocationResult);
      if (!isTelemetryUsage(usage)) return ZERO_USAGE;
      return usage;
    },
    isAvailable(invocationResult) {
      try {
        return Boolean(spec.isAvailable(invocationResult));
      } catch {
        return false;
      }
    },
  };
}

module.exports = { defineTelemetryAdapter };
