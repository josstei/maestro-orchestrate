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
async function collectStdin({ onOverflow } = {}) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_STDIN_BYTES) {
      if (onOverflow) onOverflow();
      throw new Error('Stdin payload too large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

async function readText() {
  if (process.stdin.isTTY) return '';
  return collectStdin({ onOverflow: () => log('ERROR', 'Stdin payload exceeds maximum size') });
}

module.exports = { collectStdin, readText };
