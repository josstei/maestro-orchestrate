'use strict';

const { log } = require('./logger');

const MAX_STDIN_BYTES = 1024 * 1024;

/**
 * Collect stdin up to MAX_STDIN_BYTES. With `decode`, chunks are read as
 * UTF-8 strings (StringDecoder joins split multi-byte sequences); otherwise
 * raw Buffers are concatenated and decoded once at the end. Rejects with
 * `Stdin payload too large` once the cap is exceeded, after calling
 * `onOverflow` when provided.
 */
function collectStdin({ decode = false, onOverflow } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    if (decode) process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      totalBytes += Buffer.byteLength(chunk, 'utf8');
      if (totalBytes > MAX_STDIN_BYTES) {
        if (onOverflow) onOverflow();
        process.stdin.destroy();
        reject(new Error('Stdin payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on('end', () => {
      resolve(decode ? chunks.join('') : Buffer.concat(chunks).toString());
    });
    process.stdin.resume();
  });
}

async function readText() {
  if (process.stdin.isTTY) return '';
  return collectStdin({
    decode: true,
    onOverflow: () => log('ERROR', 'Stdin payload exceeds maximum size'),
  });
}

/**
 * Read stdin as a raw Buffer and parse as JSON. No TTY guard — intended for
 * hook adapters that always receive piped input.
 *
 * Rejects with `Stdin payload too large` if the payload exceeds the cap, and
 * with the underlying `SyntaxError` if the payload is not valid JSON. Callers
 * (see `hook-runner.js`) translate the rejection into an `errorFallback()`
 * response on stdout instead of crashing the host process.
 */
function readBoundedJson() {
  return collectStdin().then((raw) => JSON.parse(raw));
}

module.exports = { readText, readBoundedJson };
