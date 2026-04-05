#!/usr/bin/env node
'use strict';

const { readState } = require('../lib/state/session-state');
const { fatal } = require('../lib/core/logger');

const stateFile = process.argv[2];
if (!stateFile) {
  fatal('Usage: read-state.js <relative-path>');
}

try {
  const content = readState(stateFile, process.cwd());
  process.stdout.write(content);
} catch (err) {
  fatal(err.message);
}
