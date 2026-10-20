'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
 * @param {string} plansDir - the plans directory
 * @param {string} resolvedPath - absolute, already `path.resolve`d path
 * @returns {boolean} true when the path lies inside `plansDir`
 */
function isInsidePlansDir(plansDir, resolvedPath) {
  return resolvedPath.startsWith(path.resolve(plansDir) + path.sep);
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
 * @param {string} projectRoot
 * @param {string} filename - pure basename, already validated by the caller
 * @param {string} content
 * @returns {string} absolute path of the written document
 */
function writePlansDocument(projectRoot, filename, content) {
  const destination = path.join(plansDirPath(projectRoot), filename);
  atomicWriteSync(destination, content);
  return destination;
}

/**
 * Move a session's documents that lie inside `<basePath>/plans/` into
 * `<basePath>/plans/archive/`. Creates the archive directory even when there
 * is nothing to move. Documents outside the plans directory or missing on disk
 * are left alone.
 *
 * @param {string} projectRoot
 * @param {string} basePath - Resolved state dir
 * @param {Array<string | null | undefined>} documentPaths - absolute or workspace-relative paths; falsy entries are skipped
 * @returns {string[]} archive destinations of the moved documents, in input order
 */
function archivePlansDocuments(projectRoot, basePath, documentPaths) {
  const plansDir = path.join(basePath, 'plans');
  const plansArchiveDir = path.join(plansDir, 'archive');
  fs.mkdirSync(plansArchiveDir, { recursive: true });

  const archivedFiles = [];
  for (const documentPath of documentPaths.filter(Boolean)) {
    const absoluteDocumentPath = path.resolve(toWorkspacePath(projectRoot, documentPath));
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
  ensureDesignDocumentInPlans,
  writePlansDocument,
  archivePlansDocuments,
};
