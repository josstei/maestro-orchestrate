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
    tool: 'archive_session',
    pattern: /no active session/i,
    hint: 'Call get_session_status first to verify a session exists.',
  },
  {
    tool: 'update_session',
    pattern: /no active session|ENOENT/i,
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

function getRecoveryHint(toolName, errorMessage) {
  const row = RECOVERY_TABLE.find((r) => r.tool === toolName && r.pattern.test(errorMessage));
  return row ? row.hint : null;
}

module.exports = {
  getRecoveryHint,
};
