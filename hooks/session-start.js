#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readJson } = require('../src/lib/stdin');
const { advisory } = require('../src/lib/response');
const { validateSessionId } = require('../src/lib/validation');
const hookState = require('../src/lib/hook-state');
const { hasActiveSession } = require('../src/lib/state');
const { log } = require('../src/lib/logger');

async function main() {
  const input = await readJson();
  const sessionId = input.session_id || '';
  const cwd = input.cwd || '';

  hookState.pruneStale();

  if (!hasActiveSession(cwd)) {
    process.stdout.write(advisory() + '\n');
    return;
  }

  if (validateSessionId(sessionId)) {
    const baseDir = hookState.getBaseDir();
    fs.mkdirSync(path.join(baseDir, sessionId), { recursive: true });
  }

  process.stdout.write(advisory() + '\n');
}

main().catch((err) => {
  log('ERROR', `Hook failed — returning safe default: ${err.message}`);
  process.stdout.write(advisory() + '\n');
});
