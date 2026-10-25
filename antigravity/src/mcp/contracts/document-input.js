'use strict';

const path = require('node:path');

const { ValidationError } = require('../../lib/errors');

/**
 * Validate a document supplied either by path (`params[pathKey]`) or by inline
 * content (`<prefix>_content` + `<prefix>_filename`); the two variants are
 * mutually exclusive. The content variant is staged for atomic publication to
 * `<state_dir>/plans/<filename>` in the caller's transaction. It exists for callers whose write
 * surface resolves paths against a different filesystem root than the MCP
 * server's workspace (e.g. a Plan Mode that writes to a host tmp directory)
 * and so cannot pass a path the server can find.
 *
 * @param {object} params - tool params holding the document keys
 * @param {{ pathKey: string, prefix: string }} keys
 * @returns {{ path: string } | { filename: string, content: string } | null}
 * @throws {ValidationError} when both variants are supplied, the content variant is incomplete, or the filename is not a pure basename
 */
function parseDocumentInput(params, { pathKey, prefix }) {
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
    return hasPath ? { path: params[pathKey] } : null;
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
  return { filename, content: params[contentKey] };
}

module.exports = {
  parseDocumentInput,
};
