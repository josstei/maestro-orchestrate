'use strict';

const { readBoundedJson } = require('../../../core/stdin-reader');
const { EXIT_SUCCESS } = require('./exit-codes');

/**
 * Gemini hook I/O adapter.
 * Normalizes Gemini stdin JSON to the internal context contract
 * and formats internal responses for Gemini stdout.
 */

function normalizeInput(raw) {
  return {
    sessionId: raw.session_id || '',
    cwd: raw.cwd || '',
    event: raw.hook_event_name || '',
    agentName: null,
    agentInput: raw.prompt || '',
    agentResult: raw.prompt_response || '',
    stopHookActive: raw.stop_hook_active === true || raw.stop_hook_active === 'true',
  };
}

function formatOutput(result) {
  return {
    continue: result.action !== 'deny',
    systemMessage: result.message || result.reason || undefined,
  };
}

function errorFallback() {
  return { continue: true };
}

function getExitCode() {
  return EXIT_SUCCESS;
}

module.exports = { normalizeInput, formatOutput, errorFallback, readBoundedStdin: readBoundedJson, getExitCode };
