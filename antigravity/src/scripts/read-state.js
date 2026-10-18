#!/usr/bin/env node
'use strict';

const { readState } = require('../state/session-state');
const { fatal } = require('../core/logger');

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
