#!/usr/bin/env node
'use strict';

const { writeState } = require('../state/session-state');
const { readText } = require('../core/stdin-reader');
const { fatal } = require('../core/logger');

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
