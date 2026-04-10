'use strict';

function getRecoveryHint(toolName, errorMessage) {
  if (toolName === 'create_session' && /already exists/i.test(errorMessage)) {
    return 'Call get_session_status to check the current session, then archive_session if you want to start fresh.';
  }

  if (toolName === 'transition_phase' && /not found/i.test(errorMessage)) {
    return 'Call get_session_status to verify the current session and phase IDs.';
  }

  if (toolName === 'archive_session' && /no active session/i.test(errorMessage)) {
    return 'Call get_session_status first to verify a session exists.';
  }

  if (toolName === 'update_session' && /no active session|ENOENT/i.test(errorMessage)) {
    return 'Call get_session_status to verify a session exists before updating.';
  }

  if (toolName === 'update_session' && /updatable field/i.test(errorMessage)) {
    return 'Provide at least one of: execution_mode, execution_backend, current_batch.';
  }

  if (toolName === 'initialize_workspace' && /permission|EACCES|EPERM/i.test(errorMessage)) {
    return 'Check that the target directory is writable.';
  }

  return null;
}

module.exports = {
  getRecoveryHint,
};
