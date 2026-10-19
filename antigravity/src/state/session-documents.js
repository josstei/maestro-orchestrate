'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { ValidationError } = require('../lib/errors');
const { atomicWriteSync } = require('../lib/io');
const { resolveStateDirPath } = require('./session-state');

/**
 * Canonical location where approved design documents live. Runtimes (including
 * Plan Mode) may write design docs to arbitrary temporary locations; this
 * function is the single source of truth for the post-approval location so the
 * archive flow can reliably find and move the document.
 *
 * @param {string} projectRoot
 * @returns {string}
 */
function plansDirPath(projectRoot) {
  return path.join(resolveStateDirPath(projectRoot), 'plans');
}

/**
 * Resolve a caller-supplied document path: absolute paths pass through,
 * relative paths are joined onto the workspace root.
 *
 * @param {string} projectRoot
 * @param {string} documentPath
 * @returns {string}
 */
function toWorkspacePath(projectRoot, documentPath) {
  return path.isAbsolute(documentPath)
    ? documentPath
    : path.join(projectRoot, documentPath);
}

/**
 * @param {string} projectRoot
 * @param {string} resolvedPath - absolute, already `path.resolve`d path
 * @returns {boolean} true when the path lies inside `<state_dir>/plans/`
 */
function isInsidePlansDir(projectRoot, resolvedPath) {
  return resolvedPath.startsWith(path.resolve(plansDirPath(projectRoot)) + path.sep);
}

/**
 * Copy a design document to `<state_dir>/plans/<basename>` when it isn't
 * already there. Idempotent: returns the in-plans path regardless of whether a
 * copy was needed. Preserves the source file so runtime-managed tmp locations
 * (Plan Mode) remain intact.
 *
 * @param {string} projectRoot
 * @param {string} sourcePath - absolute path to the approved design document
 * @returns {string} absolute path to the canonical location inside plans/
 */
function ensureDesignDocumentInPlans(projectRoot, sourcePath) {
  const plansDir = plansDirPath(projectRoot);
  const resolvedSource = path.resolve(sourcePath);

  if (isInsidePlansDir(projectRoot, resolvedSource)) {
    return resolvedSource;
  }

  fs.mkdirSync(plansDir, { recursive: true });
  const destination = path.join(plansDir, path.basename(resolvedSource));
  fs.copyFileSync(resolvedSource, destination);
  return destination;
}

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
  const destination = path.join(plansDirPath(projectRoot), filename);
  atomicWriteSync(destination, params[contentKey]);
  return destination;
}

/**
 * Move a session's documents into `<basePath>/plans/archive/`. Creates the
 * archive directory even when there is nothing to move. Documents outside
 * `<state_dir>/plans/` or missing on disk are left alone.
 *
 * @param {string} projectRoot
 * @param {string} basePath - Resolved state dir
 * @param {Array<string | null | undefined>} documentPaths - absolute or workspace-relative paths; falsy entries are skipped
 * @returns {string[]} archive destinations of the moved documents, in input order
 */
function archivePlansDocuments(projectRoot, basePath, documentPaths) {
  const plansArchiveDir = path.join(basePath, 'plans', 'archive');
  fs.mkdirSync(plansArchiveDir, { recursive: true });

  const archivedFiles = [];
  for (const documentPath of documentPaths.filter(Boolean)) {
    const absoluteDocumentPath = path.resolve(toWorkspacePath(projectRoot, documentPath));
    if (
      !isInsidePlansDir(projectRoot, absoluteDocumentPath) ||
      !fs.existsSync(absoluteDocumentPath)
    ) {
      continue;
    }

    const destinationPath = path.join(
      plansArchiveDir,
      path.basename(absoluteDocumentPath)
    );
    fs.renameSync(absoluteDocumentPath, destinationPath);
    archivedFiles.push(destinationPath);
  }
  return archivedFiles;
}

module.exports = {
  toWorkspacePath,
  ensureDesignDocumentInPlans,
  resolveDocumentInput,
  archivePlansDocuments,
};
