#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { resolveSetting } = require('../config/setting-resolver');
const { resolveProjectRoot } = require('../core/project-root-resolver');
const { resolveActiveSessionPath } = require('../state/session-state');

function main() {
  const projectRoot = resolveProjectRoot();

  const resolvedStateDir = resolveSetting('MAESTRO_STATE_DIR', projectRoot);
  if (resolvedStateDir) {
    process.env.MAESTRO_STATE_DIR = resolvedStateDir;
  }

  try {
    const sessionPath = resolveActiveSessionPath(projectRoot);
    const content = fs.readFileSync(sessionPath, 'utf8');
    process.stdout.write(content);
  } catch {
    process.stdout.write('No active session\n');
  }
}

main();
