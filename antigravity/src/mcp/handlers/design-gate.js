'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { assertSessionId } = require('../../lib/validation');
const { ValidationError, StateError } = require('../../lib/errors');
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

  const now = new Date().toISOString();
  const gate = readGate(projectRoot, params.session_id) || createGate(params.session_id, now);
  gate.approved_at = now;
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
 * Find approved design gates whose session_id does not match the caller's.
 * The orchestrator must use a single session_id from enter_design_gate through
 * archive_session; a mismatched approved gate signals either (a) an in-flight
 * workflow the caller forgot to continue with the original id or (b) an
 * abandoned prior run. create_session uses this to fail fast rather than
 * silently discard the approved design document.
 *
 * Reads the `state/` directory once and parses each `<session_id>.design-gate.json`
 * artifact. Corrupt or unapproved gate files are skipped silently.
 *
 * @param {string} projectRoot
 * @param {string} currentSessionId
 * @returns {Array<{session_id: string, approved_at: string, design_document_path: string | null}>}
 */
function findOrphanedApprovedGates(projectRoot, currentSessionId) {
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
    if (sessionId.length === 0 || sessionId === currentSessionId) continue;
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
 * Reject create_session when an approved design gate exists for a different
 * session_id. This signals the orchestrator drifted away from the session_id
 * it entered the gate with — silently proceeding would strand the approved
 * design document because create_session looks the gate up by session_id.
 * The error names the orphaned ids and describes remediation so the caller
 * can either align on the original id or delete the stale gate file before
 * retrying.
 *
 * @param {string} projectRoot
 * @param {string} currentSessionId
 * @throws {ValidationError} when an orphaned approved gate is detected
 */
function assertNoOrphanedApprovedGate(projectRoot, currentSessionId) {
  const orphans = findOrphanedApprovedGates(projectRoot, currentSessionId);
  if (orphans.length === 0) return;

  const orphanedIds = orphans.map((gate) => gate.session_id);
  const idList = orphanedIds.map((id) => `'${id}'`).join(', ');
  const stalePaths = orphans
    .map((g) => `<state_dir>/state/${g.session_id}${GATE_FILENAME}`)
    .join(', ');
  throw new ValidationError(
    `Approved design gate exists for session ${idList} but create_session was called with '${currentSessionId}'. Session IDs must match across enter_design_gate, record_design_approval, and create_session. Either call create_session with the matching session_id, or delete the stale gate file(s) at ${stalePaths} and re-enter the gate with '${currentSessionId}'.`,
    {
      code: 'DESIGN_GATE_SESSION_MISMATCH',
      details: {
        current_session_id: currentSessionId,
        orphaned_session_ids: orphanedIds,
      },
    }
  );
}

/**
 * Read the current session's design gate and enforce create_session's gate
 * preconditions. The orphaned-gate check runs only when the current session
 * has no gate: a current-session gate (approved or not) is the normal
 * approve-then-create flow, and any leftover gate from a prior workflow in the
 * same workspace is benign alongside the valid one.
 *
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {ReturnType<typeof readGate>} the current session's gate, or null when none exists
 * @throws {ValidationError} DESIGN_GATE_SESSION_MISMATCH when an orphaned approved gate is detected
 * @throws {StateError} DESIGN_GATE_UNAPPROVED when the gate was entered but not approved
 */
function readGateForCreateSession(projectRoot, sessionId) {
  const gate = readGate(projectRoot, sessionId);
  if (gate === null) {
    assertNoOrphanedApprovedGate(projectRoot, sessionId);
  }

  if (gate && gate.entered_at && !gate.approved_at) {
    throw new StateError(
      'Design gate entered but not approved. Call record_design_approval before create_session.',
      { code: 'DESIGN_GATE_UNAPPROVED' }
    );
  }

  return gate;
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
  handleEnterDesignGate,
  handleRecordDesignApproval,
  handleGetDesignGateStatus,
  readGate,
  findOrphanedApprovedGates,
  readGateForCreateSession,
  toWorkspacePath,
  isInsidePlansDir,
  ensureDesignDocumentInPlans,
  resolveDocumentInput,
  removeDesignGate,
};
