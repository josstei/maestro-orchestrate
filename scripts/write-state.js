#!/usr/bin/env node
'use strict';

const { writeState } = require('../lib/state/session-state');
const { readText } = require('../lib/core/stdin-reader');
const { fatal } = require('../lib/core/logger');

const stateFile = process.argv[2];
if (!stateFile) {
  fatal('Usage: write-state.js <relative-path>');
}

readText()
  .then((content) => {
    if (!content) {
      fatal('stdin content is empty');
    }
    writeState(stateFile, content, process.cwd());
  })
  .catch((err) => {
    fatal(err.message);
  });
