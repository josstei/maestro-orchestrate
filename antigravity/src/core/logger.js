'use strict';

function log(level, message) {
  process.stderr.write(`[${level}] maestro: ${message}\n`);
}

function fatal(message) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
}

module.exports = { log, fatal };
