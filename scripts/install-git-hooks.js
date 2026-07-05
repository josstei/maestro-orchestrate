#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
const HOOKS_DIR = '.githooks';

if (!fs.existsSync(HOOKS_DIR)) {
  process.exit(0);
}

let topLevel;

try {
  topLevel = execSync('git rev-parse --show-toplevel', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  process.exit(0);
}

if (path.resolve(topLevel) !== path.resolve('.')) {
  process.exit(0);
}

execSync(`git config core.hooksPath ${HOOKS_DIR}`, { stdio: 'inherit' });
console.log(`postinstall: git hooks activated (${HOOKS_DIR}/)`);
