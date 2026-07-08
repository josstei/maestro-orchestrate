/**
 * Base error class for the Maestro platform.
 * Provides structured error metadata via `code`, `details`, and `context` properties.
 *
 * @extends Error
 */
export interface MaestroErrorOptions {
  readonly code?: string;
  readonly details?: unknown;
  readonly context?: unknown;
}

class MaestroError extends Error {
  code: string;
  details: unknown;
  context: unknown;

  /**
   * @param message - Human-readable error description
   * @param opts - Structured error metadata.
   */
  constructor(message: string, { code = 'MAESTRO_ERROR', details = null, context = null }: MaestroErrorOptions = {}) {
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
 * @param name - Class name (also used for stack labels)
 * @param defaultCode - Code applied when opts.code is absent
 */
function defineError(name: string, defaultCode: string): typeof MaestroError {
  const klass = class extends MaestroError {
    constructor(message: string, opts: MaestroErrorOptions = {}) {
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
