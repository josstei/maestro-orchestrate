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

const MAX_STDIN_BYTES = 1024 * 1024;

function readBoundedStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    function cleanup() {
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onError);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onData(chunk) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_STDIN_BYTES) {
        cleanup();
        process.stdin.destroy();
        reject(new Error('Stdin payload too large'));
        return;
      }
      chunks.push(chunk);
    }

    function onEnd() {
      cleanup();
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (error) {
        reject(new Error('Invalid JSON on stdin: ' + error.message));
      }
    }

    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
  });
}

module.exports = { normalizeInput, formatOutput, readBoundedStdin };
