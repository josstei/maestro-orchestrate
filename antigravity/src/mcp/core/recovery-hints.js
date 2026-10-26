'use strict';

const RECOVERY_TABLE = [
  {
    tool: 'create_session',
    pattern: /already exists/i,
    hint: 'Call get_session_status to check the current session, then archive_session if you want to start fresh.',
  },
  {
    tool: 'transition_phase',
    pattern: /not found/i,
    hint: 'Call get_session_status to verify the current session and phase IDs.',
  },
  {
    tool: 'update_session',
    pattern: /ENOENT/i,
    hint: 'Call get_session_status to verify a session exists before updating.',
  },
  {
    tool: 'update_session',
    pattern: /updatable field/i,
    hint: 'Provide at least one of: execution_mode, execution_backend, current_batch.',
  },
  {
    tool: 'initialize_workspace',
    pattern: /permission|EACCES|EPERM/i,
    hint: 'Check that the target directory is writable.',
  },
];

const STATE_RECOVERY_HINTS = {
  STATE_BUSY: 'Another Maestro process owns this workspace state. Wait for it to finish, then retry. Do not remove a live lock.',
  STATE_RECOVERED: 'Interrupted work has been completed. Call get_session_status and get_design_gate_status to inspect the recovered state before deciding whether to retry.',
  STATE_RECOVERY_REQUIRED: 'Keep the transaction journal intact. Resolve the reported filesystem error or unexpected file change, then access the workspace again to finish recovery.',
  STATE_CONFLICT: 'Read the current file and its SHA-256 again, merge your changes, and retry with the new expected hash.',
};

function getRecoveryHint(toolName, errorMessage, errorCode) {
  if (Object.hasOwn(STATE_RECOVERY_HINTS, errorCode)) {
    return STATE_RECOVERY_HINTS[errorCode];
  }
  const row = RECOVERY_TABLE.find((r) => r.tool === toolName && r.pattern.test(errorMessage));
  return row ? row.hint : null;
}

module.exports = {
  getRecoveryHint,
};
