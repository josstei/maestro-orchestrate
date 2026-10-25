'use strict';

const path = require('node:path');

const { NotFoundError } = require('../lib/errors');

/**
 * Canonical location where approved design documents live. Runtimes (including
 * Plan Mode) may write design docs to arbitrary temporary locations; this
 * function is the single source of truth for the post-approval location so the
 * archive flow can reliably find and move the document.
 *
 * @param {object} tx
 * @returns {string}
 */
function plansDirPath(tx) {
  return path.join(tx.basePath, 'plans');
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
 * @param {string} plansDir - the plans directory
 * @param {string} resolvedPath - absolute, already `path.resolve`d path
 * @returns {boolean} true when the path lies inside `plansDir`
 */
function isInsidePlansDir(plansDir, resolvedPath) {
  return resolvedPath.startsWith(path.resolve(plansDir) + path.sep);
}

/**
 * Materialize a session document (design or plan) into `<state_dir>/plans/`.
 * Mirrors the design-gate contract so both documents are reachable by
 * `archive_session` regardless of where Plan Mode wrote them.
 *
 * Used at `create_session` time rather than `record_design_approval` because
 * a runtime's parallel dispatch can fire a write and an MCP tool in the same
 * turn; the write isn't yet visible when the MCP handler runs. Deferring the
 * copy to `create_session` guarantees the file has settled on disk.
 *
 * @param {string} projectRoot
 * @param {string} documentPath - absolute or workspace-relative path
 * @param {'design_document' | 'implementation_plan'} documentKind
 * @returns {string | null} absolute path to the canonical location inside plans/, or null if documentPath was absent
 */
function materializeSessionDocument(projectRoot, documentPath, documentKind, tx) {
  if (typeof documentPath !== 'string' || documentPath.length === 0) {
    return null;
  }
  const absolutePath = toWorkspacePath(projectRoot, documentPath);
  if (!tx.exists(absolutePath)) {
    const context =
      documentKind === 'design_document'
        ? ' (recorded via record_design_approval but not found at create_session time — confirm the file was materialized after Plan Mode exit)'
        : ' (confirm the plan was written to disk before calling create_session)';
    throw new NotFoundError(`${documentKind} does not exist: ${absolutePath}${context}`);
  }
  const plansDir = plansDirPath(tx);
  const resolvedSource = path.resolve(absolutePath);

  if (isInsidePlansDir(plansDir, resolvedSource)) {
    return resolvedSource;
  }

  tx.mkdir(plansDir, { recursive: true });
  const destination = path.join(plansDir, path.basename(resolvedSource));
  tx.copyFile(resolvedSource, destination);
  return destination;
}

/**
 * Materialize a validated document input. Path inputs use the caller's path
 * handling; inline content is staged in `<state_dir>/plans/<filename>`.
 *
 * @param {{ path: string } | { filename: string, content: string } | null} document
 * @param {(documentPath: string) => string} fromPath
 * @param {object} tx
 * @returns {string | null} absolute document path, or null for absent input
 */
function materializeDocumentInput(document, fromPath, tx) {
  if (!document) return null;
  if (document.path) return fromPath(document.path);
  const destination = path.join(plansDirPath(tx), document.filename);
  tx.writeFile(destination, document.content);
  return destination;
}

/**
 * Move a session's documents that lie inside `<state_dir>/plans/` into
 * `<state_dir>/plans/archive/`. Creates the archive directory even when there
 * is nothing to move. Documents outside the plans directory or missing on disk
 * are left alone.
 *
 * @param {string} projectRoot
 * @param {Array<string | null | undefined>} documentPaths - absolute or workspace-relative paths; falsy entries are skipped
 * @param {object} tx
 * @returns {string[]} archive destinations of the moved documents, in input order
 */
function archivePlansDocuments(projectRoot, documentPaths, tx) {
  const plansDir = plansDirPath(tx);
  const plansArchiveDir = path.join(plansDir, 'archive');
  tx.mkdir(plansArchiveDir, { recursive: true });

  const archivedFiles = [];
  for (const documentPath of documentPaths.filter(Boolean)) {
    const absoluteDocumentPath = path.resolve(toWorkspacePath(projectRoot, documentPath));
    if (
      !isInsidePlansDir(plansDir, absoluteDocumentPath) ||
      !tx.exists(absoluteDocumentPath)
    ) {
      continue;
    }

    const destinationPath = path.join(
      plansArchiveDir,
      path.basename(absoluteDocumentPath)
    );
    tx.rename(absoluteDocumentPath, destinationPath);
    archivedFiles.push(destinationPath);
  }
  return archivedFiles;
}

module.exports = {
  toWorkspacePath,
  materializeSessionDocument,
  materializeDocumentInput,
  archivePlansDocuments,
};
