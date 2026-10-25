'use strict';

const { assertSessionId } = require('../../lib/validation');
const { ValidationError } = require('../../lib/errors');
const { withStateMutation, withStateRead } = require('../../state/coordinator');
const { resolveStateDirPath } = require('../../state/paths');
const { createGate, readGate, writeGate } = require('../../state/design-gate');
const { toWorkspacePath, materializeDocumentInput } = require('../../state/session-documents');
const { parseDocumentInput } = require('../contracts/document-input');

/**
 * @param {{ session_id: string }} params
 * @param {string} projectRoot
 */
function handleEnterDesignGate(params, projectRoot) {
  assertSessionId(params.session_id);
  const basePath = resolveStateDirPath(projectRoot);
  return withStateMutation(basePath, { operation: 'enter_design_gate', sessionId: params.session_id }, (tx) => {
    const existing = readGate(basePath, params.session_id, tx);
    if (existing && existing.entered_at) {
      return { success: true, entered_at: existing.entered_at, already_entered: true };
    }
    const gate = createGate(params.session_id, new Date().toISOString());
    writeGate(basePath, params.session_id, gate, tx);
    return { success: true, entered_at: gate.entered_at, already_entered: false };
  });
}

/**
 * @param {{ session_id: string, design_document_path?: string, design_document_content?: string, design_document_filename?: string }} params
 * @param {string} projectRoot
 */
function handleRecordDesignApproval(params, projectRoot) {
  assertSessionId(params.session_id);
  const document = parseDocumentInput(params, {
    pathKey: 'design_document_path',
    prefix: 'design_document',
  });
  if (document === null) {
    throw new ValidationError(
      'record_design_approval requires either design_document_path or both design_document_content and design_document_filename'
    );
  }
  const basePath = resolveStateDirPath(projectRoot);
  return withStateMutation(basePath, { operation: 'record_design_approval', sessionId: params.session_id }, (tx) => {
    const absDesignPath = materializeDocumentInput(document,
      (documentPath) => toWorkspacePath(projectRoot, documentPath), tx);

    const now = new Date().toISOString();
    const gate = readGate(basePath, params.session_id, tx) || createGate(params.session_id, now);
    gate.approved_at = now;
    gate.design_document_path = absDesignPath;
    writeGate(basePath, params.session_id, gate, tx);

    return {
      success: true,
      entered_at: gate.entered_at,
      approved_at: gate.approved_at,
      design_document_path: absDesignPath,
    };
  });
}

/**
 * @param {{ session_id: string }} params
 * @param {string} projectRoot
 */
function handleGetDesignGateStatus(params, projectRoot) {
  assertSessionId(params.session_id);
  const basePath = resolveStateDirPath(projectRoot);
  return withStateRead(basePath, () =>
    readGate(basePath, params.session_id) || createGate(params.session_id)
  );
}

module.exports = {
  handleEnterDesignGate,
  handleRecordDesignApproval,
  handleGetDesignGateStatus,
};
