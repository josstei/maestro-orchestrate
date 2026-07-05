import { ValidationError } from '../../lib/errors/index.js';

/**
 * Resolve a document supplied as exactly one of (path) or (content + filename).
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
  const { pathKey, contentKey, filenameKey, requireMessage, resolvePath, writeContent } = options;
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
    return writeContent(params[filenameKey], params[contentKey]);
  }

  if (hasPath) return resolvePath(params[pathKey]);
  if (requireMessage) throw new ValidationError(requireMessage);
  return null;
}

export { resolveDocumentInput };
