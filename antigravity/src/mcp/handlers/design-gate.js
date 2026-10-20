'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { assertSessionId } = require('../../lib/session-id');
const { ValidationError, StateError } = require('../../lib/errors');
const { resolveStateDirPath } = require('../../state/session-state');
const { toWorkspacePath, writePlansDocument } = require('../../state/session-documents');
const { readDocumentInput } = require('../contracts/document-input');
const { atomicWriteSync, readJsonSafe } = require('../../lib/io');

const GATE_FILENAME = '.design-gate.json';

/**
 * Directory holding every session's gate file: `<state_dir>/state`.
 * @param {string} projectRoot
 * @returns {string}
 */
function gateDir(projectRoot) {
  return path.join(resolveStateDirPath(projectRoot), 'state');
}

/**
 * Resolves the filesystem path for the gate file for a given session.
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {string}
 */
function gatePath(projectRoot, sessionId) {
  return path.join(gateDir(projectRoot), `${sessionId}${GATE_FILENAME}`);
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
  const design = readDocumentInput(params, 'design_document_path', 'design_document');
  if (design === null) {
    throw new ValidationError(
      'record_design_approval requires either design_document_path or both design_document_content and design_document_filename'
    );
  }
  const stateDir = resolveStateDirPath(projectRoot);
  const absDesignPath = design.path
    ? toWorkspacePath(projectRoot, design.path)
    : writePlansDocument(stateDir, design.filename, design.content);

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
  const stateDir = gateDir(projectRoot);
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
  removeDesignGate,
};
