'use strict';

/**
 * Base error class for the Maestro platform.
 * Provides structured error metadata via `code`, `details`, and `context` properties.
 *
 * @extends Error
 */
class MaestroError extends Error {
  /**
   * @param {string} message - Human-readable error description
   * @param {object} [opts]
   * @param {string} [opts.code='MAESTRO_ERROR'] - Machine-readable error code
   * @param {*} [opts.details=null] - Structured payload describing the failure
   * @param {*} [opts.context=null] - Ambient context at the point of failure
   */
  constructor(message, { code = 'MAESTRO_ERROR', details = null, context = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.context = context;
  }
}

/**
 * Define a MaestroError subclass named `name` whose `code` defaults to
 * `defaultCode`. Callers may pass a more specific subtype code via `opts.code`
 * (e.g. HANDOFF_INCOMPLETE, DESIGN_GATE_UNAPPROVED, RECONCILIATION_PENDING);
 * `opts.details` and `opts.context` are passed through to MaestroError.
 *
 * @param {string} name - Class name (also used as `err.name`)
 * @param {string} defaultCode - Code used when `opts.code` is not provided
 * @returns {typeof MaestroError}
 */
function defineErrorType(name, defaultCode) {
  return {
    [name]: class extends MaestroError {
      constructor(message, opts = {}) {
        super(message, { ...opts, code: opts.code || defaultCode });
      }
    },
  }[name];
}

module.exports = {
  MaestroError,
  /** Raised when input data or arguments fail validation constraints. */
  ValidationError: defineErrorType('ValidationError', 'VALIDATION_ERROR'),
  /** Raised when a requested resource (agent, session, file, etc.) does not exist. */
  NotFoundError: defineErrorType('NotFoundError', 'NOT_FOUND'),
  /** Raised when an operation is invalid for the current session or workflow state. */
  StateError: defineErrorType('StateError', 'STATE_ERROR'),
};
