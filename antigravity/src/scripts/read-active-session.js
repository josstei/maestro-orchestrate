#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { resolveProjectRoot } = require('../core/project-root-resolver');
const { activeSessionFile, resolveStateDirPath } = require('../state/paths');
const { withStateRead } = require('../state/coordinator');
const { fatal } = require('../core/logger');
const { isCoordinationError, stateErrorMessage } = require('./state-access');

async function main() {
  const projectRoot = resolveProjectRoot();

  try {
    const basePath = resolveStateDirPath(projectRoot);
    const content = await withStateRead(basePath, () => fs.readFileSync(activeSessionFile(basePath), 'utf8'));
    process.stdout.write(content);
  } catch (error) {
    if (isCoordinationError(error)) throw error;
    process.stdout.write('No active session\n');
  }
}

main().catch((error) => fatal(stateErrorMessage(error)));
