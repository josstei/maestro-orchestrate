#!/usr/bin/env node
'use strict';

const { ensureWorkspace, DEFAULT_STATE_DIR } = require('../state/session-state');
const { fatal } = require('../core/logger');

const stateDirSetting = process.argv[2] || DEFAULT_STATE_DIR;
const root = process.cwd();

try {
  ensureWorkspace(root, stateDirSetting);
} catch (err) {
  fatal(err.message);
}
