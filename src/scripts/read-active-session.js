#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { resolveSetting } = require('../config/setting-resolver');
const { resolveProjectRoot } = require('../core/project-root-resolver');
const { resolveActiveSessionPath } = require('../state/session-state');

function main() {
  const projectRoot = resolveProjectRoot();
  const stateDir = resolveSetting('MAESTRO_STATE_DIR', projectRoot);

  try {
    const sessionPath = resolveActiveSessionPath(projectRoot, stateDir);
    const content = fs.readFileSync(sessionPath, 'utf8');
    process.stdout.write(content);
  } catch {
    process.stdout.write('No active session\n');
  }
}

main();
