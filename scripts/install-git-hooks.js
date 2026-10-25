#!/usr/bin/env node
'use strict';

/**
 * Activates the repo-local git hooks under .githooks/ (run explicitly via
 * `npm run install-hooks`).
 *
 * Activation conditions (all must hold):
 *   1. Current directory contains .githooks/ — i.e. the script runs from
 *      the root of a maestro checkout.
 *   2. `git rev-parse --show-toplevel` resolves to the current directory —
 *      this is true in the main checkout AND in any git worktree pointing
 *      at it. False outside a git checkout entirely.
 *
 * If either condition fails, the script exits 0 with no side effect.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const HOOKS_DIR = '.githooks';

if (!fs.existsSync(HOOKS_DIR)) {
  process.exit(0);
}

let topLevel;
try {
  topLevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  process.exit(0);
}

if (path.resolve(topLevel) !== path.resolve('.')) {
  process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', HOOKS_DIR], { stdio: 'inherit' });
console.log(`install-hooks: git hooks activated (${HOOKS_DIR}/)`);
