#!/usr/bin/env node
'use strict';

// Points core.hooksPath at the repo-local .githooks/ (`npm run install-hooks`), but only from
// the top level of a maestro checkout or one of its git worktrees; elsewhere it is a no-op.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const HOOKS_DIR = '.githooks';

// spawnSync never throws, so a missing git or a non-repo cwd simply fails the status check.
const probe = fs.existsSync(HOOKS_DIR)
  && spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
if (probe && probe.status === 0 && path.resolve(probe.stdout.trim()) === path.resolve('.')) {
  execFileSync('git', ['config', 'core.hooksPath', HOOKS_DIR], { stdio: 'inherit' });
  console.log(`install-hooks: git hooks activated (${HOOKS_DIR}/)`);
}
