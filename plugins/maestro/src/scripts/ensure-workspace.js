#!/usr/bin/env node
'use strict';

const { ensureWorkspace } = require('../state/session-state');
const { DEFAULT_STATE_DIR } = require('../state/paths');
const { runStateCommand } = require('./state-access');

const stateDir = process.argv[2] || DEFAULT_STATE_DIR;
const basePath = process.cwd();

runStateCommand(() => ensureWorkspace(stateDir, basePath));
