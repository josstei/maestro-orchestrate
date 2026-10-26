'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { ValidationError, StateError } = require('../lib/errors');
const { readJsonSafe } = require('../lib/io');

const GATE_FILENAME = '.design-gate.json';

/**
 * Directory holding every session's gate file: `<state_dir>/state`.
 * @param {string} basePath
 * @returns {string}
 */
function gateDir(basePath) {
  return path.join(basePath, 'state');
}

/**
 * Resolves the filesystem path for the gate file for a given session.
 * @param {string} basePath
 * @param {string} sessionId
 * @returns {string}
 */
function gatePath(basePath, sessionId) {
  return path.join(gateDir(basePath), `${sessionId}${GATE_FILENAME}`);
}

/**
 * @param {object} ctx - State transaction or withStateRead view
 * @param {string} sessionId
 * @returns {{ session_id: string, entered_at: string | null, approved_at: string | null, design_document_path: string | null } | null}
 */
function readGate(ctx, sessionId) {
  try { return JSON.parse(ctx.readFile(gatePath(ctx.basePath, sessionId), 'utf8')); } catch { return null; }
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
 * @param {object} tx - State transaction
 * @param {string} sessionId
 * @param {object} data
 */
function writeGate(tx, sessionId, data) {
  tx.writeFile(gatePath(tx.basePath, sessionId), JSON.stringify(data, null, 2));
}

/**
 * Reject approved design gates whose session_id does not match the caller's.
 * The orchestrator must use a single session_id from enter_design_gate through
 * archive_session; a mismatched approved gate signals either (a) an in-flight
 * workflow the caller forgot to continue with the original id or (b) an
 * abandoned prior run. create_session uses this to fail fast rather than
 * silently discard the approved design document.
 *
 * Reads the `state/` directory once and parses each `<session_id>.design-gate.json`
 * artifact. Corrupt or unapproved gate files are skipped silently.
 *
 * @param {string} basePath
 * @param {string} currentSessionId
 * @throws {ValidationError} when an orphaned approved gate is detected
 */
function assertNoOrphanedApprovedGate(basePath, currentSessionId) {
  const stateDir = gateDir(basePath);
  let entries;
  try {
    entries = fs.readdirSync(stateDir);
  } catch {
    return;
  }
  const orphanedIds = [];
  for (const entry of entries) {
    if (!entry.endsWith(GATE_FILENAME)) continue;
    const sessionId = entry.slice(0, -GATE_FILENAME.length);
    if (sessionId.length === 0 || sessionId === currentSessionId) continue;
    // Unreadable or corrupt gates read as null and are skipped; detection is best-effort.
    const gate = readJsonSafe(path.join(stateDir, entry));
    if (gate && typeof gate.approved_at === 'string' && gate.approved_at.length > 0) {
      orphanedIds.push(sessionId);
    }
  }
  if (orphanedIds.length === 0) return;

  const idList = orphanedIds.map((id) => `'${id}'`).join(', ');
  const stalePaths = orphanedIds
    .map((id) => `<state_dir>/state/${id}${GATE_FILENAME}`)
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
 * @param {object} tx - State transaction
 * @param {string} sessionId
 * @returns {ReturnType<typeof readGate>} the current session's gate, or null when none exists
 * @throws {ValidationError} DESIGN_GATE_SESSION_MISMATCH when an orphaned approved gate is detected
 * @throws {StateError} DESIGN_GATE_UNAPPROVED when the gate was entered but not approved
 */
function readGateForCreateSession(tx, sessionId) {
  const gate = readGate(tx, sessionId);
  if (gate === null) {
    assertNoOrphanedApprovedGate(tx.basePath, sessionId);
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
 * @param {object} tx - State transaction
 * @param {string} sessionId
 */
function removeDesignGate(tx, sessionId) {
  const filePath = gatePath(tx.basePath, sessionId);
  if (tx.exists(filePath)) tx.unlink(filePath);
}

module.exports = {
  createGate,
  readGate,
  writeGate,
  readGateForCreateSession,
  removeDesignGate,
};
