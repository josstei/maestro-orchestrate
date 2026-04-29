#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  REQUIRED_PACKAGE_FILES,
} = require('./release-artifact-manifest');

const ROOT = path.resolve(__dirname, '..');
const FORBIDDEN_PACKAGE_PREFIXES = [
  '.github/',
  'coverage/',
  'dist/',
  'docs/maestro/',
  'node_modules/',
  'tests/',
];

function parsePackJson(stdout) {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`npm pack did not emit JSON output:\n${stdout}`);
  }

  return JSON.parse(stdout.slice(start, end + 1));
}

function runNpmPackDryRun(root = ROOT) {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-npm-pack-cache-'));

  try {
    const stdout = execFileSync('npm', ['pack', '--dry-run', '--json', '--cache', cacheDir], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parsePackJson(stdout);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

function verifyPackageEntries(packages) {
  if (!Array.isArray(packages) || packages.length !== 1) {
    throw new Error('Expected npm pack to report exactly one package');
  }

  const entries = packages[0].files.map((file) => file.path);

  for (const requiredPath of REQUIRED_PACKAGE_FILES) {
    if (!entries.includes(requiredPath)) {
      throw new Error(`npm package missing required file: ${requiredPath}`);
    }
  }

  for (const entry of entries) {
    for (const forbiddenPrefix of FORBIDDEN_PACKAGE_PREFIXES) {
      if (entry === forbiddenPrefix.slice(0, -1) || entry.startsWith(forbiddenPrefix)) {
        throw new Error(`npm package contains forbidden path: ${entry}`);
      }
    }
  }

  return {
    entryCount: entries.length,
    filename: packages[0].filename,
  };
}

function verifyNpmPack(root = ROOT) {
  return verifyPackageEntries(runNpmPackDryRun(root));
}

if (require.main === module) {
  try {
    const result = verifyNpmPack();
    console.log(`Verified npm pack contents: ${result.filename} (${result.entryCount} files)`);
  } catch (error) {
    console.error(`npm pack verification failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  FORBIDDEN_PACKAGE_PREFIXES,
  parsePackJson,
  runNpmPackDryRun,
  verifyNpmPack,
  verifyPackageEntries,
};
