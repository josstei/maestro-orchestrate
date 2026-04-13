'use strict';

const { readBoundedJson } = require('../../../core/stdin-reader');

/**
 * Qwen Code hook I/O adapter.
 * Normalizes Qwen Code stdin JSON to the internal context contract
 * and formats internal responses for Qwen Code stdout.
 *
 * Qwen auto-migrates the Gemini extension; hook I/O contract matches Gemini's.
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

module.exports = { normalizeInput, formatOutput, errorFallback, readBoundedStdin: readBoundedJson };
