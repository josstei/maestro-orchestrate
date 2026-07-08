import { getRecoveryHint } from './recovery-hints.js';
import { MaestroError } from '../../lib/errors/index.js';
import type { ToolFailure, ToolOutcome, ToolSuccess } from './tool-types.js';
const INTERNAL_TOOL_ERROR_CODE = 'INTERNAL_TOOL_ERROR';

type CreateToolFailureOptions = {
  error: string;
  code?: string | null;
  recovery_hint?: string | null;
  details?: unknown;
};

function sanitizeErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : String(error);
  return message.replace(/\/[^\s'"]+/g, '[path]');
}

function createToolSuccess<TResult>(result: TResult): ToolSuccess<TResult> {
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
}: CreateToolFailureOptions): ToolFailure {
  const outcome: ToolFailure = {
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

function normalizeToolError(toolName: string, error: unknown): ToolOutcome<never> {
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

export { createToolFailure, createToolSuccess, normalizeToolError };
