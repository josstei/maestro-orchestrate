#!/usr/bin/env node
'use strict';

const { ensureWorkspace, DEFAULT_STATE_DIR } = require('../state/session-state');
const { fatal } = require('../core/logger');

const stateDir = process.argv[2] || DEFAULT_STATE_DIR;
const basePath = process.cwd();

try {
  ensureWorkspace(stateDir, basePath);
} catch (err) {
  fatal(err.message);
}
