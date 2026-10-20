'use strict';

const { assertSessionId } = require('../../lib/session-id');
const { ValidationError } = require('../../lib/errors');
const { resolveStateDirPath } = require('../../state/session-state');
const { toWorkspacePath, writePlansDocument } = require('../../state/session-documents');
const { readGate, createGate, writeGate } = require('../../state/design-gate');
const { readDocumentInput } = require('../contracts/document-input');

/**
 * @param {{ session_id: string }} params
 * @param {string} projectRoot
 */
function handleEnterDesignGate(params, projectRoot) {
  assertSessionId(params.session_id);
  const stateDir = resolveStateDirPath(projectRoot);
  const existing = readGate(stateDir, params.session_id);
  if (existing && existing.entered_at) {
    return { success: true, entered_at: existing.entered_at, already_entered: true };
  }
  const gate = createGate(params.session_id, new Date().toISOString());
  writeGate(stateDir, params.session_id, gate);
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
  const gate = readGate(stateDir, params.session_id) || createGate(params.session_id, now);
  gate.approved_at = now;
  gate.design_document_path = absDesignPath;
  writeGate(stateDir, params.session_id, gate);

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
  return readGate(resolveStateDirPath(projectRoot), params.session_id) || createGate(params.session_id);
}

module.exports = {
  handleEnterDesignGate,
  handleRecordDesignApproval,
  handleGetDesignGateStatus,
};
