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
 * Build a MaestroError subclass whose only specialization is its default code.
 *
 * @param {string} name - Class name (also used for stack labels)
 * @param {string} defaultCode - Code applied when opts.code is absent
 * @returns {typeof MaestroError}
 */
function defineError(name, defaultCode) {
  const klass = class extends MaestroError {
    constructor(message, opts = {}) {
      super(message, { ...opts, code: opts.code || defaultCode });
    }
  };
  Object.defineProperty(klass, 'name', { value: name });
  return klass;
}

const ValidationError = defineError('ValidationError', 'VALIDATION_ERROR');
const NotFoundError = defineError('NotFoundError', 'NOT_FOUND');
const StateError = defineError('StateError', 'STATE_ERROR');
export { MaestroError, ValidationError, NotFoundError, StateError };
