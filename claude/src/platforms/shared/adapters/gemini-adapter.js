'use strict';

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

const MAX_STDIN_BYTES = 1024 * 1024;

function readBoundedStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    process.stdin.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_STDIN_BYTES) {
        process.stdin.destroy();
        reject(new Error('Stdin payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on('end', () => {
      resolve(JSON.parse(Buffer.concat(chunks).toString()));
    });
  });
}

module.exports = { normalizeInput, formatOutput, errorFallback, readBoundedStdin };
