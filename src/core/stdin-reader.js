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

module.exports = { readText, readJson };
