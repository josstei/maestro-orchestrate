'use strict';

const { assertSessionId } = require('../../lib/validation');
const { ValidationError } = require('../../lib/errors');
const { createGate, readGate, writeGate } = require('../../state/design-gate');
const { toWorkspacePath, materializeDocumentInput } = require('../../state/session-documents');
const { parseDocumentInput } = require('../contracts/document-input');

function enterDesignGate({ params }, tx) {
  const existing = readGate(tx, params.session_id);
  if (existing && existing.entered_at) {
    return { success: true, entered_at: existing.entered_at, already_entered: true };
  }
  const gate = createGate(params.session_id, new Date().toISOString());
  writeGate(tx, params.session_id, gate);
  return { success: true, entered_at: gate.entered_at, already_entered: false };
}

/**
 * @param {{ session_id: string, design_document_path?: string, design_document_content?: string, design_document_filename?: string }} params
 */
function parseDesignDocument(params) {
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
  return document;
}

function recordDesignApproval({ params, projectRoot, input: document }, tx) {
  const absDesignPath = materializeDocumentInput(document,
    (documentPath) => toWorkspacePath(projectRoot, documentPath), tx);

  const now = new Date().toISOString();
  const gate = readGate(tx, params.session_id) || createGate(params.session_id, now);
  gate.approved_at = now;
  gate.design_document_path = absDesignPath;
  writeGate(tx, params.session_id, gate);

  return {
    success: true,
    entered_at: gate.entered_at,
    approved_at: gate.approved_at,
    design_document_path: absDesignPath,
  };
}

function getDesignGateStatus({ params }, view) {
  return readGate(view, params.session_id) || createGate(params.session_id);
}

module.exports = {
  enter_design_gate: { access: 'mutate', run: enterDesignGate },
  record_design_approval: { access: 'mutate', run: recordDesignApproval, prepare: parseDesignDocument },
  get_design_gate_status: { access: 'read', run: getDesignGateStatus },
};
