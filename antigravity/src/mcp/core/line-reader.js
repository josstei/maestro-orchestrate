'use strict';

const readline = require('node:readline');

const { log } = require('../../core/logger');

/**
 * Create a readline-based line dispatcher for a stdin stream.
 * Each non-empty JSON line is parsed and forwarded to `onMessage`.
 * Parse errors are logged and dropped; the reader keeps running.
 */
function createLineDispatcher(stdin, onMessage) {
  const lineReader = readline.createInterface({
    input: stdin,
    crlfDelay: Infinity,
  });

  lineReader.on('line', (line) => {
    if (!line.trim()) {
      return;
    }

    try {
      onMessage(JSON.parse(line));
    } catch (error) {
      log('error', `Failed to parse MCP message: ${error.message}`);
    }
  });

  return lineReader;
}

module.exports = {
  createLineDispatcher,
};
