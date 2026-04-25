'use strict';

const { log } = require('./logger');

const MAX_STDIN_BYTES = 1024 * 1024;

function readText() {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks = [];
    let totalBytes = 0;
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      totalBytes += Buffer.byteLength(chunk, 'utf8');
      if (totalBytes > MAX_STDIN_BYTES) {
        log('ERROR', 'Stdin payload exceeds maximum size');
        process.stdin.destroy();
        reject(new Error('Stdin payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on('end', () => {
      resolve(chunks.join(''));
    });
    process.stdin.resume();
  });
}

function readJson() {
  return readText().then((raw) => {
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      log('WARN', 'Failed to parse JSON from stdin');
      return {};
    }
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
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (error) {
        reject(error);
      }
    });
  });
}

module.exports = { readText, readJson, readBoundedJson };
