'use strict';

const fs = require('fs');
const path = require('path');

const { assertSessionId } = require('../../lib/validation');
const { ValidationError } = require('../../lib/errors');
const { resolveStateDirPath } = require('../../state/session-state');
const { atomicWriteSync } = require('../../lib/io');

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
  const resolvedPlansDir = path.resolve(plansDir) + path.sep;
  const resolvedSource = path.resolve(sourcePath);

  if (resolvedSource.startsWith(resolvedPlansDir)) {
    return resolvedSource;
  }

  fs.mkdirSync(plansDir, { recursive: true });
  const destination = path.join(plansDir, path.basename(resolvedSource));
  fs.copyFileSync(resolvedSource, destination);
  return destination;
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
 * @param {{ session_id: string, design_document_path: string }} params
 * @param {string} projectRoot
 */
function handleRecordDesignApproval(params, projectRoot) {
  assertSessionId(params.session_id);
  if (typeof params.design_document_path !== 'string' || params.design_document_path.length === 0) {
    throw new ValidationError('design_document_path is required');
  }
  const absDesignPath = path.isAbsolute(params.design_document_path)
    ? params.design_document_path
    : path.join(projectRoot, params.design_document_path);

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
  getApprovedDesignDocumentPath,
  ensureDesignDocumentInPlans,
  plansDirPath,
  removeDesignGate,
};
