'use strict';

const { log } = require('./logger');

function readText() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
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
