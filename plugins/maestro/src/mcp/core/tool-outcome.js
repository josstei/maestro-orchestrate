'use strict';

const { getRecoveryHint } = require('./recovery-hints');
const { MaestroError } = require('../../lib/errors');

const UNKNOWN_TOOL_CODE = 'UNKNOWN_TOOL';
const INTERNAL_TOOL_ERROR_CODE = 'INTERNAL_TOOL_ERROR';

function sanitizeErrorMessage(error) {
  const message = error && error.message ? error.message : String(error);
  return message.replace(/\/[^\s'"]+/g, '[path]');
}

function createToolSuccess(result) {
  return {
    ok: true,
    result,
  };
}

function createToolFailure({
  error,
  code = null,
  recovery_hint = null,
  details = undefined,
}) {
  const outcome = {
    ok: false,
    error,
    recovery_hint,
  };

  if (code) {
    outcome.code = code;
  }

  if (details !== undefined && details !== null) {
    outcome.details = details;
  }

  return outcome;
}

function createUnknownToolFailure(name) {
  return createToolFailure({
    error: `Unknown tool: ${name}`,
    code: UNKNOWN_TOOL_CODE,
  });
}

function normalizeToolError(toolName, error) {
  if (error instanceof MaestroError) {
    return createToolFailure({
      error: error.message,
      code: error.code,
      recovery_hint: getRecoveryHint(toolName, error.message),
      details: error.details,
    });
  }

  const sanitized = sanitizeErrorMessage(error);
  return createToolFailure({
    error: sanitized,
    code: INTERNAL_TOOL_ERROR_CODE,
    recovery_hint: getRecoveryHint(toolName, sanitized),
  });
}

module.exports = {
  INTERNAL_TOOL_ERROR_CODE,
  UNKNOWN_TOOL_CODE,
  createToolFailure,
  createToolSuccess,
  createUnknownToolFailure,
  normalizeToolError,
  sanitizeErrorMessage,
};
