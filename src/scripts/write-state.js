#!/usr/bin/env node
'use strict';

const { writeState } = require('../state/session-state');
const { readStdin } = require('../lib/io');
const { log, fatal } = require('../core/logger');

const stateFile = process.argv[2];
if (!stateFile) {
  fatal('Usage: write-state.js <relative-path>');
}
if (process.stdin.isTTY) {
  fatal('stdin content is empty');
}

readStdin()
  .then((content) => {
    if (!content) {
      fatal('stdin content is empty');
    }
    writeState(process.cwd(), stateFile, content);
  }, (err) => {
    // readStdin rejects only for a payload over its cap.
    log('ERROR', 'Stdin payload exceeds maximum size');
    throw err;
  })
  .catch((err) => {
    fatal(err.message);
  });
