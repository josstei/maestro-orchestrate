'use strict';

function log(level, message) {
  process.stderr.write(`[${level}] maestro: ${message}\n`);
}

module.exports = { log };
