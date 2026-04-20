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
 * Raised when input data or arguments fail validation constraints.
 *
 * @extends MaestroError
 */
class ValidationError extends MaestroError {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {string} [opts.code='VALIDATION_ERROR'] - Subtype code for specific failures (e.g. HANDOFF_INCOMPLETE)
   * @param {*} [opts.details]
   * @param {*} [opts.context]
   */
  constructor(message, opts = {}) {
    super(message, { ...opts, code: opts.code || 'VALIDATION_ERROR' });
  }
}

/**
 * Raised when a requested resource (agent, session, file, etc.) does not exist.
 *
 * @extends MaestroError
 */
class NotFoundError extends MaestroError {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {string} [opts.code='NOT_FOUND'] - Subtype code for specific failures
   * @param {*} [opts.details]
   * @param {*} [opts.context]
   */
  constructor(message, opts = {}) {
    super(message, { ...opts, code: opts.code || 'NOT_FOUND' });
  }
}

/**
 * Raised when configuration is missing, malformed, or internally inconsistent.
 *
 * @extends MaestroError
 */
class ConfigError extends MaestroError {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {string} [opts.code='CONFIG_ERROR'] - Subtype code for specific failures
   * @param {*} [opts.details]
   * @param {*} [opts.context]
   */
  constructor(message, opts = {}) {
    super(message, { ...opts, code: opts.code || 'CONFIG_ERROR' });
  }
}

/**
 * Raised when an operation is invalid for the current session or workflow state.
 *
 * @extends MaestroError
 */
class StateError extends MaestroError {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {string} [opts.code='STATE_ERROR'] - Subtype code for specific failures (e.g. DESIGN_GATE_UNAPPROVED, RECONCILIATION_PENDING)
   * @param {*} [opts.details]
   * @param {*} [opts.context]
   */
  constructor(message, opts = {}) {
    super(message, { ...opts, code: opts.code || 'STATE_ERROR' });
  }
}

module.exports = {
  MaestroError,
  ValidationError,
  NotFoundError,
  ConfigError,
  StateError,
};
