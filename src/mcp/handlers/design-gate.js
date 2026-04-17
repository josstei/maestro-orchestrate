'use strict';

const fs = require('fs');
const path = require('path');

const { assertSessionId } = require('../../lib/validation');
const { ValidationError, NotFoundError } = require('../../lib/errors');
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
  if (!params.design_document_path) {
    throw new ValidationError('design_document_path is required');
  }
  const absDesignPath = path.isAbsolute(params.design_document_path)
    ? params.design_document_path
    : path.join(projectRoot, params.design_document_path);
  if (!fs.existsSync(absDesignPath)) {
    throw new NotFoundError(`Design document does not exist: ${absDesignPath}`);
  }
  const stat = fs.statSync(absDesignPath);
  if (!stat.isFile() || stat.size === 0) {
    throw new ValidationError(`Design document is empty: ${absDesignPath}`);
  }

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
    design_document_path: gate.design_document_path,
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

module.exports = {
  handleEnterDesignGate,
  handleRecordDesignApproval,
  handleGetDesignGateStatus,
  isDesignGateBlockingCreate,
};
