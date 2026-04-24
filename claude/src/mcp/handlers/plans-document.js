'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { ValidationError, NotFoundError } = require('../../lib/errors');
const { atomicWriteSync } = require('../../lib/io');
const { resolveStateDirPath } = require('../../state/session-state');

/**
 * Canonical location where approved design documents and implementation
 * plans live. Runtimes (including Gemini Plan Mode) may write these
 * documents to arbitrary temporary locations; this function is the
 * single source of truth for the post-approval location so the archive
 * flow can reliably find and move them.
 *
 * @param {string} projectRoot
 * @returns {string}
 */
function plansDirPath(projectRoot) {
  return path.join(resolveStateDirPath(projectRoot), 'plans');
}

/**
 * Validate that a caller-provided filename is safe to join into the
 * plans directory. Rejects anything that could escape the directory
 * or collide with a nested path.
 *
 * @param {string} filename
 * @param {string} paramName
 * @throws {ValidationError}
 */
function assertPlansFilename(filename, paramName) {
  if (typeof filename !== 'string' || filename.length === 0) {
    throw new ValidationError(`${paramName} is required`);
  }
  if (filename.includes('\0')) {
    throw new ValidationError(`${paramName} contains null bytes`, {
      details: { value: filename },
    });
  }
  if (filename !== path.basename(filename) || filename === '..' || filename === '.') {
    throw new ValidationError(
      `${paramName} must be a pure basename (no path separators, no '.' or '..')`,
      { details: { value: filename } }
    );
  }
}

/**
 * Normalize a caller-supplied path to its absolute form, without
 * checking that the file exists. Workspace-relative paths are joined
 * against `projectRoot`.
 *
 * @param {string} projectRoot
 * @param {string} docPath
 * @returns {string}
 */
function toAbsoluteDocPath(projectRoot, docPath) {
  return path.isAbsolute(docPath) ? docPath : path.join(projectRoot, docPath);
}

/**
 * Copy a document to `<state_dir>/plans/<basename>` when it isn't
 * already there. Idempotent: returns the in-plans path regardless of
 * whether a copy was needed. Preserves the source file so
 * runtime-managed tmp locations (Plan Mode) remain intact.
 *
 * @param {string} projectRoot
 * @param {string} docPath - absolute or workspace-relative path
 * @param {string} documentKind - 'design_document' or 'implementation_plan'
 * @returns {string} absolute path to the canonical location inside plans/
 * @throws {NotFoundError} when the source file is missing
 */
function materializePlansDocument(projectRoot, docPath, documentKind) {
  const absolutePath = toAbsoluteDocPath(projectRoot, docPath);

  if (!fs.existsSync(absolutePath)) {
    const context =
      documentKind === 'design_document'
        ? ' (recorded via record_design_approval but not found at create_session time — confirm the file was materialized after Plan Mode exit)'
        : ' (confirm the plan was written to disk before calling create_session)';
    throw new NotFoundError(`${documentKind} does not exist: ${absolutePath}${context}`);
  }

  const plansDir = plansDirPath(projectRoot);
  const resolvedPlansDir = path.resolve(plansDir) + path.sep;
  const resolvedSource = path.resolve(absolutePath);

  if (resolvedSource.startsWith(resolvedPlansDir)) {
    return resolvedSource;
  }

  fs.mkdirSync(plansDir, { recursive: true });
  const destination = path.join(plansDir, path.basename(resolvedSource));
  fs.copyFileSync(resolvedSource, destination);
  return destination;
}

/**
 * Write caller-supplied document content to `<state_dir>/plans/<filename>`
 * atomically and return the canonical absolute path. The content-based
 * counterpart to `materializePlansDocument` — callers that cannot
 * guarantee filesystem visibility across runtime boundaries
 * (e.g. Gemini Plan Mode writes to `~/.gemini/tmp/...`) use this to
 * bypass path-resolution ambiguity entirely.
 *
 * @param {string} projectRoot
 * @param {string} filename - basename-only, validated via assertPlansFilename
 * @param {string} content - UTF-8 document content
 * @param {string} filenameParam - parameter name for validation errors
 * @returns {string} absolute canonical path inside plans/
 */
function writePlansDocumentContent(projectRoot, filename, content, filenameParam) {
  assertPlansFilename(filename, filenameParam);
  if (typeof content !== 'string' || content.length === 0) {
    throw new ValidationError(
      `${filenameParam.replace(/_filename$/, '_content')} must be a non-empty string`
    );
  }
  const destination = path.join(plansDirPath(projectRoot), filename);
  atomicWriteSync(destination, content);
  return destination;
}

/**
 * @typedef {object} DocumentInputSpec
 * @property {string} pathKey - param name carrying the path variant (e.g. 'design_document_path')
 * @property {string} contentKey - param name carrying the inline content variant
 * @property {string} filenameKey - param name carrying the filename for the content variant
 * @property {boolean} [required=false] - when true, throws if neither variant is supplied
 * @property {string} [missingMessage] - custom message for the required-but-absent case
 */

/**
 * Resolve the caller's one-of input shape to a canonical absolute path.
 * Exactly one of:
 *   - the path variant (`spec.pathKey`) — normalized to absolute, no
 *     existence check or copy is performed (the file may not yet be on
 *     disk; callers that require existence should follow up with
 *     `materializePlansDocument`), or
 *   - the content variant (`spec.contentKey` + `spec.filenameKey`) —
 *     materialized immediately inside `<state_dir>/plans/`, eliminating
 *     the path-resolution ambiguity that arises when callers write
 *     through a runtime surface whose filesystem root differs from the
 *     MCP server's workspace.
 * may be provided. When `spec.required` is false, absence is valid and
 * returns `null`.
 *
 * @param {object} params
 * @param {string} projectRoot
 * @param {DocumentInputSpec} spec
 * @returns {string|null}
 * @throws {ValidationError} on mutually exclusive or incomplete input
 */
function resolveDocumentInput(params, projectRoot, spec) {
  const {
    pathKey,
    contentKey,
    filenameKey,
    required = false,
    missingMessage,
  } = spec;

  const hasPath =
    typeof params[pathKey] === 'string' && params[pathKey].length > 0;
  const hasContent =
    typeof params[contentKey] === 'string' && params[contentKey].length > 0;
  const hasFilename =
    typeof params[filenameKey] === 'string' && params[filenameKey].length > 0;
  const contentVariantProvided = hasContent || hasFilename;

  if (hasPath && contentVariantProvided) {
    throw new ValidationError(
      `${pathKey} is mutually exclusive with ${contentKey}/${filenameKey}`
    );
  }

  if (contentVariantProvided) {
    if (!hasContent) {
      throw new ValidationError(`${contentKey} is required`);
    }
    if (!hasFilename) {
      throw new ValidationError(`${filenameKey} is required`);
    }
    return writePlansDocumentContent(
      projectRoot,
      params[filenameKey],
      params[contentKey],
      filenameKey
    );
  }

  if (hasPath) {
    return toAbsoluteDocPath(projectRoot, params[pathKey]);
  }

  if (required) {
    throw new ValidationError(
      missingMessage ||
        `Missing input: provide either ${pathKey} or ${contentKey} + ${filenameKey}`
    );
  }

  return null;
}

/**
 * Move a plans document into the plans archive directory. No-op (returns
 * null) when the document resolves outside the plans directory or the
 * file no longer exists.
 *
 * @param {string} docPath - absolute or workspace-relative path
 * @param {string} projectRoot
 * @param {string} plansArchiveDir - absolute path to plans/archive/
 * @returns {string|null} destination path inside the archive, or null
 */
function relocatePlansDocumentToArchive(docPath, projectRoot, plansArchiveDir) {
  const absoluteDocumentPath = path.resolve(
    path.isAbsolute(docPath) ? docPath : path.join(projectRoot, docPath)
  );

  const resolvedPlansDir = path.resolve(plansDirPath(projectRoot)) + path.sep;
  if (!absoluteDocumentPath.startsWith(resolvedPlansDir)) {
    return null;
  }

  if (!fs.existsSync(absoluteDocumentPath)) {
    return null;
  }

  const destination = path.join(plansArchiveDir, path.basename(absoluteDocumentPath));
  fs.renameSync(absoluteDocumentPath, destination);
  return destination;
}

module.exports = {
  plansDirPath,
  toAbsoluteDocPath,
  materializePlansDocument,
  writePlansDocumentContent,
  resolveDocumentInput,
  relocatePlansDocumentToArchive,
};
