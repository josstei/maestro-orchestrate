'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { atomicWriteSync } = require('../lib/io');
const { NotFoundError } = require('../lib/errors');

/**
 * Resolve a caller-supplied document path: absolute paths pass through,
 * relative paths are joined onto the workspace root.
 *
 * @param {string} root - Workspace root
 * @param {string} documentPath
 * @returns {string}
 */
function toWorkspacePath(root, documentPath) {
  return path.isAbsolute(documentPath)
    ? documentPath
    : path.join(root, documentPath);
}

/**
 * @param {string} plansDir - the plans directory
 * @param {string} resolvedPath - absolute, already `path.resolve`d path
 * @returns {boolean} true when the path lies inside `plansDir`
 */
function isInsidePlansDir(plansDir, resolvedPath) {
  return resolvedPath.startsWith(path.resolve(plansDir) + path.sep);
}

/**
 * Materialize a session document (design or plan) into `<state_dir>/plans/`
 * so `archive_session` finds both documents regardless of where Plan Mode
 * wrote them. A document already inside plans/ is used in place; any other is
 * copied to `plans/<basename>`, leaving the source intact so runtime-managed
 * tmp locations (Plan Mode) are not disturbed.
 *
 * Runs at `create_session` time rather than `record_design_approval` because
 * a runtime's parallel dispatch can fire a write and an MCP tool in the same
 * turn; the write isn't yet visible when the MCP handler runs. Deferring the
 * copy to `create_session` guarantees the file has settled on disk.
 *
 * @param {string} root - Workspace root
 * @param {string} stateDir - Resolved state dir
 * @param {unknown} documentPath - absolute or workspace-relative path
 * @param {'design_document' | 'implementation_plan'} documentKind
 * @returns {string | null} absolute path of the document inside plans/, or null when documentPath is not a non-empty string
 * @throws {NotFoundError} when the document does not exist
 */
function materializeSessionDocument(root, stateDir, documentPath, documentKind) {
  if (typeof documentPath !== 'string' || documentPath.length === 0) {
    return null;
  }
  const absolutePath = toWorkspacePath(root, documentPath);
  if (!fs.existsSync(absolutePath)) {
    const context =
      documentKind === 'design_document'
        ? ' (recorded via record_design_approval but not found at create_session time — confirm the file was materialized after Plan Mode exit)'
        : ' (confirm the plan was written to disk before calling create_session)';
    throw new NotFoundError(`${documentKind} does not exist: ${absolutePath}${context}`);
  }

  const plansDir = path.join(stateDir, 'plans');
  const resolvedSource = path.resolve(absolutePath);
  if (isInsidePlansDir(plansDir, resolvedSource)) {
    return resolvedSource;
  }

  fs.mkdirSync(plansDir, { recursive: true });
  const destination = path.join(plansDir, path.basename(resolvedSource));
  fs.copyFileSync(resolvedSource, destination);
  return destination;
}

/**
 * Write `content` atomically to `<state_dir>/plans/<filename>`.
 *
 * @param {string} stateDir - Resolved state dir
 * @param {string} filename - pure basename, already validated by the caller
 * @param {string} content
 * @returns {string} absolute path of the written document
 */
function writePlansDocument(stateDir, filename, content) {
  const destination = path.join(stateDir, 'plans', filename);
  atomicWriteSync(destination, content);
  return destination;
}

/**
 * Move a session's documents that lie inside `<state_dir>/plans/` into
 * `<state_dir>/plans/archive/`. Creates the archive directory even when there
 * is nothing to move. Documents outside the plans directory or missing on disk
 * are left alone.
 *
 * @param {string} root - Workspace root
 * @param {string} stateDir - Resolved state dir
 * @param {Array<string | null | undefined>} documentPaths - absolute or workspace-relative paths; falsy entries are skipped
 * @returns {string[]} archive destinations of the moved documents, in input order
 */
function archivePlansDocuments(root, stateDir, documentPaths) {
  const plansDir = path.join(stateDir, 'plans');
  const plansArchiveDir = path.join(plansDir, 'archive');
  fs.mkdirSync(plansArchiveDir, { recursive: true });

  const archivedFiles = [];
  for (const documentPath of documentPaths.filter(Boolean)) {
    const absoluteDocumentPath = path.resolve(toWorkspacePath(root, documentPath));
    if (
      !isInsidePlansDir(plansDir, absoluteDocumentPath) ||
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
  materializeSessionDocument,
  writePlansDocument,
  archivePlansDocuments,
};
