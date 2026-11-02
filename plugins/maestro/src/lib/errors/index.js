'use strict';

/** Base Maestro error: a machine-readable `code` and structured `details`. */
class MaestroError extends Error {
  constructor(message, { code = 'MAESTRO_ERROR', details = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

/**
 * Define a MaestroError subclass named `name` whose `code` defaults to
 * `defaultCode`. Callers may pass a more specific subtype code via `opts.code`
 * (e.g. HANDOFF_INCOMPLETE, DESIGN_GATE_UNAPPROVED, RECONCILIATION_PENDING).
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
  defineErrorType,
  ValidationError: defineErrorType('ValidationError', 'VALIDATION_ERROR'),
  NotFoundError: defineErrorType('NotFoundError', 'NOT_FOUND'),
  StateError: defineErrorType('StateError', 'STATE_ERROR'),
};
