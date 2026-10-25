#!/usr/bin/env node
'use strict';

const { ensureWorkspace } = require('../state/session-state');
const { DEFAULT_STATE_DIR } = require('../state/paths');
const { fatal } = require('../core/logger');
const { stateErrorMessage } = require('./state-access');

const stateDir = process.argv[2] || DEFAULT_STATE_DIR;
const basePath = process.cwd();

ensureWorkspace(stateDir, basePath)
  .catch((err) => fatal(stateErrorMessage(err)));
