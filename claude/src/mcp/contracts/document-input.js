'use strict';

const path = require('node:path');

const { ValidationError } = require('../../lib/errors');
const { writePlansDocument } = require('../../state/session-documents');

/**
 * Resolve a document supplied either by path (`params[pathKey]`) or by inline
 * content (`<prefix>_content` + `<prefix>_filename`); the two variants are
 * mutually exclusive. The content variant is written atomically to
 * `<state_dir>/plans/<filename>` immediately. It exists for callers whose write
 * surface resolves paths against a different filesystem root than the MCP
 * server's workspace (e.g. a Plan Mode that writes to a host tmp directory)
 * and so cannot pass a path the server can find.
 *
 * @param {object} params - tool params holding the document keys
 * @param {string} projectRoot
 * @param {{ pathKey: string, prefix: string, fromPath: (documentPath: string) => string | null }} keys
 * @returns {string | null} canonical path of the written content, `fromPath(params[pathKey])` for the path variant, or null when neither variant was supplied
 * @throws {ValidationError} when both variants are supplied, the content variant is incomplete, or the filename is not a pure basename
 */
function resolveDocumentInput(params, projectRoot, { pathKey, prefix, fromPath }) {
  const contentKey = `${prefix}_content`;
  const filenameKey = `${prefix}_filename`;
  const isSet = (key) => typeof params[key] === 'string' && params[key].length > 0;
  const hasPath = isSet(pathKey);
  const hasContent = isSet(contentKey);
  const hasFilename = isSet(filenameKey);

  if (hasPath && (hasContent || hasFilename)) {
    throw new ValidationError(
      `${pathKey} is mutually exclusive with ${contentKey}/${filenameKey}`
    );
  }

  if (!hasContent && !hasFilename) {
    return hasPath ? fromPath(params[pathKey]) : null;
  }
  if (!hasContent) {
    throw new ValidationError(`${contentKey} is required`);
  }
  if (!hasFilename) {
    throw new ValidationError(`${filenameKey} is required`);
  }

  const filename = params[filenameKey];
  if (filename.includes('\0')) {
    throw new ValidationError(`${filenameKey} contains null bytes`, {
      details: { value: filename },
    });
  }
  if (filename !== path.basename(filename) || filename === '..' || filename === '.') {
    throw new ValidationError(
      `${filenameKey} must be a pure basename (no path separators, no '.' or '..')`,
      { details: { value: filename } }
    );
  }
  return writePlansDocument(projectRoot, filename, params[contentKey]);
}

module.exports = {
  resolveDocumentInput,
};
