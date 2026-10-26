'use strict';

const { log } = require('./logger');

const MAX_STDIN_BYTES = 1024 * 1024;

/**
 * Collect stdin up to MAX_STDIN_BYTES. Raw Buffers are concatenated and
 * decoded as UTF-8 once at the end, so multi-byte sequences split across
 * chunks decode intact. Rejects with `Stdin payload too large` once the cap
 * is exceeded, after calling `onOverflow` when provided. Used directly by the
 * shared hook runner and policy enforcer (src/platforms/shared/).
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

module.exports = { collectStdin, readText };
