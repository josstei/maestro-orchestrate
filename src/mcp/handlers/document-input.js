import { ValidationError } from '../../lib/errors/index.js';

/**
 * Validate the SHAPE of a document supplied as exactly one of (path) or
 * (content + filename), performing no filesystem I/O. Callers that need to
 * defer materialization (e.g. until after a consent decision) use this to
 * surface malformed-input errors without any side effect.
 *
 * @param {object} params - Raw tool params
 * @param {object} options
 * @param {string} options.pathKey - Param name of the path variant
 * @param {string} options.contentKey - Param name of the inline content
 * @param {string} options.filenameKey - Param name of the inline filename
 * @param {string|null} options.requireMessage - ValidationError message when neither variant is supplied; null makes the document optional
 * @returns {{kind: 'path', path: string} | {kind: 'content', filename: string, content: string} | null} null when optional and absent
 * @throws {ValidationError} on mutually exclusive or incomplete variants
 */
function resolveDocumentInputVariant(params, options) {
  const { pathKey, contentKey, filenameKey, requireMessage } = options;
  const has = (key) => typeof params[key] === 'string' && params[key].length > 0;
  const hasPath = has(pathKey);
  const hasContent = has(contentKey);
  const hasFilename = has(filenameKey);
  const contentVariantProvided = hasContent || hasFilename;

  if (hasPath && contentVariantProvided) {
    throw new ValidationError(`${pathKey} is mutually exclusive with ${contentKey}/${filenameKey}`);
  }

  if (contentVariantProvided) {
    if (!hasContent) throw new ValidationError(`${contentKey} is required`);
    if (!hasFilename) throw new ValidationError(`${filenameKey} is required`);
    return { kind: 'content', filename: params[filenameKey], content: params[contentKey] };
  }

  if (hasPath) return { kind: 'path', path: params[pathKey] };
  if (requireMessage) throw new ValidationError(requireMessage);
  return null;
}

/**
 * Resolve a document supplied as exactly one of (path) or (content + filename),
 * materializing the content variant immediately.
 *
 * @param {object} params - Raw tool params
 * @param {object} options
 * @param {string} options.pathKey - Param name of the path variant
 * @param {string} options.contentKey - Param name of the inline content
 * @param {string} options.filenameKey - Param name of the inline filename
 * @param {string|null} options.requireMessage - ValidationError message when neither variant is supplied; null makes the document optional
 * @param {(pathValue: string) => string} options.resolvePath - Path-variant resolution strategy
 * @param {(filename: string, content: string) => string} options.writeContent - Content-variant materialization strategy
 * @returns {string|null} canonical absolute path, or null when optional and absent
 * @throws {ValidationError} on mutually exclusive or incomplete variants
 */
function resolveDocumentInput(params, options) {
  const variant = resolveDocumentInputVariant(params, options);
  if (!variant) return null;
  if (variant.kind === 'content') return options.writeContent(variant.filename, variant.content);
  return options.resolvePath(variant.path);
}

export { resolveDocumentInput, resolveDocumentInputVariant };
