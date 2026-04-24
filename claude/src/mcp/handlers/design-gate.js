'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { assertSessionId } = require('../../lib/validation');
const { resolveStateDirPath } = require('../../state/session-state');
const { atomicWriteSync } = require('../../lib/io');
const { resolveDocumentInput } = require('./plans-document');

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
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {{ session_id: string, entered_at: string | null, approved_at: string | null, design_document_path: string | null } | null}
 */
function readGate(projectRoot, sessionId) {
  const filePath = gatePath(projectRoot, sessionId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
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
  const gate = {
    session_id: params.session_id,
    entered_at: new Date().toISOString(),
    approved_at: null,
    design_document_path: null,
  };
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
    contentKey: 'design_document_content',
    filenameKey: 'design_document_filename',
    documentKind: 'design_document',
    required: true,
    missingMessage:
      'record_design_approval requires either design_document_path or both design_document_content and design_document_filename',
  });

  const gate = readGate(projectRoot, params.session_id) || {
    session_id: params.session_id,
    entered_at: new Date().toISOString(),
    approved_at: null,
    design_document_path: null,
  };
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
  const gate = readGate(projectRoot, params.session_id);
  if (!gate) {
    return {
      session_id: params.session_id,
      entered_at: null,
      approved_at: null,
      design_document_path: null,
    };
  }
  return gate;
}

/**
 * Returns true when a session has entered the design gate but not yet received approval.
 * Used by create_session (Task 12) to block session creation until the gate is cleared.
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {boolean}
 */
function isDesignGateBlockingCreate(projectRoot, sessionId) {
  const gate = readGate(projectRoot, sessionId);
  if (!gate) return false;
  return !!(gate.entered_at && !gate.approved_at);
}

/**
 * Returns true when a gate artifact exists on disk for the given session_id,
 * regardless of whether it is approved. Used by the orphan-gate guard in
 * create_session to distinguish "orchestrator never entered this session's
 * gate" from "orchestrator is in the normal approve-then-create flow".
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {boolean}
 */
function hasDesignGate(projectRoot, sessionId) {
  return readGate(projectRoot, sessionId) !== null;
}

/**
 * Read the design document path persisted on the gate after approval. Used by
 * create_session to auto-populate `state.design_document` when the orchestrator
 * does not pass it explicitly — avoids losing the document during archival.
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {string | null}
 */
function getApprovedDesignDocumentPath(projectRoot, sessionId) {
  const gate = readGate(projectRoot, sessionId);
  if (!gate || !gate.approved_at) return null;
  return gate.design_document_path || null;
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
  if (!fs.existsSync(stateDir)) return [];
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
    const filePath = path.join(stateDir, entry);
    try {
      const gate = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (gate && typeof gate.approved_at === 'string' && gate.approved_at.length > 0) {
        gates.push({
          session_id: sessionId,
          approved_at: gate.approved_at,
          design_document_path: gate.design_document_path || null,
        });
      }
    } catch {
      // unreadable or corrupt gate — skip; detection is best-effort.
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
 * @returns {string | null} path of the removed gate file, or null if no gate existed
 */
function removeDesignGate(projectRoot, sessionId) {
  const filePath = gatePath(projectRoot, sessionId);
  if (!fs.existsSync(filePath)) return null;
  fs.unlinkSync(filePath);
  return filePath;
}

module.exports = {
  handleEnterDesignGate,
  handleRecordDesignApproval,
  handleGetDesignGateStatus,
  isDesignGateBlockingCreate,
  hasDesignGate,
  getApprovedDesignDocumentPath,
  listApprovedGates,
  findOrphanedApprovedGates,
  removeDesignGate,
};
