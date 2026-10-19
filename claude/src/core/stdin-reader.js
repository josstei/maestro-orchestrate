'use strict';

const { log } = require('./logger');

const MAX_STDIN_BYTES = 1024 * 1024;

/**
 * Collect stdin up to MAX_STDIN_BYTES. Raw Buffers are concatenated and
 * decoded as UTF-8 once at the end, so multi-byte sequences split across
 * chunks decode intact. Rejects with `Stdin payload too large` once the cap
 * is exceeded, after calling `onOverflow` when provided. Used directly by the
 * shared policy enforcer (src/platforms/shared/policy-enforcer.js).
 */
function collectStdin({ onOverflow } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    process.stdin.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_STDIN_BYTES) {
        if (onOverflow) onOverflow();
        process.stdin.destroy();
        reject(new Error('Stdin payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on('end', () => {
      resolve(Buffer.concat(chunks).toString());
    });
    process.stdin.resume();
  });
}

async function readText() {
  if (process.stdin.isTTY) return '';
  return collectStdin({ onOverflow: () => log('ERROR', 'Stdin payload exceeds maximum size') });
}

/**
 * Read stdin (bounded) and parse it as JSON. No TTY guard — intended for
 * hook-runner.js, which always receives piped input.
 *
 * Rejects with `Stdin payload too large` if the payload exceeds the cap, and
 * with the underlying `SyntaxError` if the payload is not valid JSON. Callers
 * (see `hook-runner.js`) translate the rejection into an `errorFallback()`
 * response on stdout instead of crashing the host process.
 */
function readBoundedJson() {
  return collectStdin().then((raw) => JSON.parse(raw));
}

module.exports = { collectStdin, readText, readBoundedJson };
