'use strict';

const { readBoundedJson } = require('../../../core/stdin-reader');
const { EXIT_SUCCESS } = require('./exit-codes');

/**
 * Claude Code hook I/O adapter.
 * Normalizes Claude Code stdin JSON to the internal context contract
 * and formats internal responses for Claude Code stdout.
 */

function normalizeInput(raw) {
  return {
    sessionId: raw.session_id || '',
    cwd: raw.cwd || '',
    event: raw.hook_event_name || '',
    agentName: raw.tool_input?.subagent_type || null,
    agentInput: raw.tool_input?.prompt || null,
    agentResult: raw.tool_result || null,
    stopHookActive: false,
  };
}

function formatOutput(result) {
  return {
    continue: result.action !== 'deny',
    systemMessage: result.message || result.reason || undefined,
    decision: result.action === 'deny' ? 'block' : 'approve',
    reason: result.reason || undefined,
  };
}

function errorFallback() {
  return { continue: true, decision: 'approve' };
}

function getExitCode() {
  return EXIT_SUCCESS;
}

module.exports = { normalizeInput, formatOutput, errorFallback, readBoundedStdin: readBoundedJson, getExitCode };
