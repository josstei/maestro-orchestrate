'use strict';

const { readBoundedJson } = require('../../../core/stdin-reader');
const { EXIT_SUCCESS } = require('./exit-codes');

/**
 * Adapter contract expected by `hook-runner.js`:
 *   normalizeInput(raw)  -> ctx       (runtime stdin -> internal context)
 *   formatOutput(result) -> object    (internal result -> runtime stdout)
 *   errorFallback()      -> object    (emitted on uncaught hook errors)
 *   readBoundedStdin()   -> Promise   (parse stdin as JSON, bounded size)
 *   getExitCode(result)  -> number    (process exit code; defaults to 0;
 *                                      hook-runner passes { action: 'deny' }
 *                                      on errorFallback paths)
 *
 * `defineAdapter` is a spec-assembler: it validates a caller-provided
 * spec and fills in shared defaults (stdin reader, success-exit fallback)
 * so each runtime adapter only declares its protocol-specific
 * normalize/format/fallback/exit logic. Registry dispatch by runtime
 * name is done separately by `hook-runner.js`.
 */
function defineAdapter(spec) {
  if (!spec || typeof spec.normalizeInput !== 'function') {
    throw new TypeError('Adapter spec must provide normalizeInput(raw)');
  }
  if (typeof spec.formatOutput !== 'function') {
    throw new TypeError('Adapter spec must provide formatOutput(result)');
  }
  if (typeof spec.errorFallback !== 'function') {
    throw new TypeError('Adapter spec must provide errorFallback()');
  }

  return {
    normalizeInput: spec.normalizeInput,
    formatOutput: spec.formatOutput,
    errorFallback: spec.errorFallback,
    readBoundedStdin: spec.readBoundedStdin || readBoundedJson,
    getExitCode: spec.getExitCode || (() => EXIT_SUCCESS),
  };
}

module.exports = { defineAdapter };
