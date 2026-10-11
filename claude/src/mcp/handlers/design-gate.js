'use strict';

const fs = require('fs');
const path = require('path');

const { assertSessionId } = require('../../lib/validation');
const { ValidationError } = require('../../lib/errors');
const { resolveStateDirPath } = require('../../state/session-state');
const { atomicWriteSync, readJsonSafe } = require('../../lib/io');

const GATE_FILENAME = '.design-gate.json';

/**
 * Resolves the filesystem path for the gate file for a given session.
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {string}
 */
function gatePath(projectRoot, sessionId) {
  const stateDir = resolveStateDirPath(projectRoot);
  return path.join(stateDir, 'state', `${sessionId}${GATE_FILENAME}`);
}

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
 * server's workspace (e.g. Gemini Plan Mode writes to `~/.gemini/tmp/<uuid>/...`)
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
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {{ session_id: string, entered_at: string | null, approved_at: string | null, design_document_path: string | null } | null}
 */
function readGate(projectRoot, sessionId) {
  return readJsonSafe(gatePath(projectRoot, sessionId));
}

function createGate(sessionId, enteredAt = null) {
  return {
    session_id: sessionId,
    entered_at: enteredAt,
    approved_at: null,
    design_document_path: null,
  };
}

/**
 * @param {string} projectRoot
 * @param {string} sessionId
 * @param {object} data
 */
function writeGate(projectRoot, sessionId, data) {
  const filePath = gatePath(projectRoot, sessionId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * @param {{ session_id: string }} params
 * @param {string} projectRoot
 */
function handleEnterDesignGate(params, projectRoot) {
  assertSessionId(params.session_id);
  const existing = readGate(projectRoot, params.session_id);
  if (existing && existing.entered_at) {
    return { success: true, entered_at: existing.entered_at, already_entered: true };
  }
  const gate = createGate(params.session_id, new Date().toISOString());
  writeGate(projectRoot, params.session_id, gate);
  return { success: true, entered_at: gate.entered_at, already_entered: false };
}

/**
 * @param {{ session_id: string, design_document_path?: string, design_document_content?: string, design_document_filename?: string }} params
 * @param {string} projectRoot
 */
function handleRecordDesignApproval(params, projectRoot) {
  assertSessionId(params.session_id);
  const absDesignPath = resolveDocumentInput(params, projectRoot, {
    pathKey: 'design_document_path',
    prefix: 'design_document',
    fromPath: (documentPath) => toWorkspacePath(projectRoot, documentPath),
  });
  if (absDesignPath === null) {
    throw new ValidationError(
      'record_design_approval requires either design_document_path or both design_document_content and design_document_filename'
    );
  }

  const gate =
    readGate(projectRoot, params.session_id) ||
    createGate(params.session_id, new Date().toISOString());
  gate.approved_at = new Date().toISOString();
  gate.design_document_path = absDesignPath;
  writeGate(projectRoot, params.session_id, gate);

  return {
    success: true,
    entered_at: gate.entered_at,
    approved_at: gate.approved_at,
    design_document_path: absDesignPath,
  };
}

/**
 * @param {{ session_id: string }} params
 * @param {string} projectRoot
 */
function handleGetDesignGateStatus(params, projectRoot) {
  assertSessionId(params.session_id);
  return readGate(projectRoot, params.session_id) || createGate(params.session_id);
}

/**
 * Enumerate every approved design gate currently persisted in the workspace.
 * Reads the `state/` directory once and parses each `<session_id>.design-gate.json`
 * artifact. Corrupt or unapproved gate files are skipped silently. Used by
 * create_session to detect session_id drift across the enter_design_gate →
 * record_design_approval → create_session sequence.
 *
 * @param {string} projectRoot
 * @returns {Array<{session_id: string, approved_at: string, design_document_path: string | null}>}
 */
function listApprovedGates(projectRoot) {
  const stateDir = path.join(resolveStateDirPath(projectRoot), 'state');
  let entries;
  try {
    entries = fs.readdirSync(stateDir);
  } catch {
    return [];
  }
  const gates = [];
  for (const entry of entries) {
    if (!entry.endsWith(GATE_FILENAME)) continue;
    const sessionId = entry.slice(0, -GATE_FILENAME.length);
    if (sessionId.length === 0) continue;
    // Unreadable or corrupt gates read as null and are skipped; detection is best-effort.
    const gate = readJsonSafe(path.join(stateDir, entry));
    if (gate && typeof gate.approved_at === 'string' && gate.approved_at.length > 0) {
      gates.push({
        session_id: sessionId,
        approved_at: gate.approved_at,
        design_document_path: gate.design_document_path || null,
      });
    }
  }
  return gates;
}

/**
 * Find approved design gates whose session_id does not match the caller's.
 * The orchestrator must use a single session_id from enter_design_gate through
 * archive_session; a mismatched approved gate signals either (a) an in-flight
 * workflow the caller forgot to continue with the original id or (b) an
 * abandoned prior run. create_session uses this to fail fast rather than
 * silently discard the approved design document.
 *
 * @param {string} projectRoot
 * @param {string} currentSessionId
 * @returns {Array<{session_id: string, approved_at: string, design_document_path: string | null}>}
 */
function findOrphanedApprovedGates(projectRoot, currentSessionId) {
  return listApprovedGates(projectRoot).filter(
    (gate) => gate.session_id !== currentSessionId
  );
}

/**
 * Remove the design-gate artifact for a session. Called by archive_session so
 * the gate doesn't linger in state/ after the session is archived — otherwise
 * a future session reusing the same id would inherit a stale "already approved"
 * gate from the prior run.
 * @param {string} projectRoot
 * @param {string} sessionId
 */
function removeDesignGate(projectRoot, sessionId) {
  const filePath = gatePath(projectRoot, sessionId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

module.exports = {
  GATE_FILENAME,
  handleEnterDesignGate,
  handleRecordDesignApproval,
  handleGetDesignGateStatus,
  readGate,
  listApprovedGates,
  findOrphanedApprovedGates,
  toWorkspacePath,
  isInsidePlansDir,
  ensureDesignDocumentInPlans,
  resolveDocumentInput,
  removeDesignGate,
};
