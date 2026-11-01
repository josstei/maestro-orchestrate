#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  REQUIRED_PACKAGE_FILES,
  ensure,
  ensureNone,
  isDeniedPath,
  withTempDir,
} = require('./release-artifact-manifest');
const { isBuildOnly } = require('../src/generator/build-only');
const { runCli } = require('./lib/cli');

const ROOT = path.resolve(__dirname, '..');

function parsePackJson(stdout) {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');

  ensure(start !== -1 && end > start, `npm pack did not emit JSON output:\n${stdout}`);

  return JSON.parse(stdout.slice(start, end + 1));
}

function runNpmPackDryRun() {
  return withTempDir('maestro-npm-pack-cache-', (cacheDir) => {
    const stdout = execFileSync('npm', ['pack', '--dry-run', '--json', '--cache', cacheDir], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parsePackJson(stdout);
  });
}

function verifyPackageEntries(packages) {
  ensure(Array.isArray(packages) && packages.length === 1, 'Expected npm pack to report exactly one package');

  const entries = packages[0].files.map((file) => file.path);
  // scripts/ and build-only src/ ship only the REQUIRED_PACKAGE_FILES entries.
  const isBuildPath = (entry) => entry.startsWith('scripts/')
    || (entry.startsWith('src/') && isBuildOnly(entry.slice(4)));

  ensureNone(REQUIRED_PACKAGE_FILES.filter((file) => !entries.includes(file)), 'npm package missing required file');
  ensureNone(entries.filter(isDeniedPath), 'npm package contains forbidden path');
  ensureNone(entries.filter((entry) => isBuildPath(entry) && !REQUIRED_PACKAGE_FILES.includes(entry)),
    'npm package contains build-only path');

  return {
    entryCount: entries.length,
    filename: packages[0].filename,
  };
}

if (require.main === module) {
  runCli('npm pack verification failed', () => {
    const result = verifyPackageEntries(runNpmPackDryRun());
    console.log(`Verified npm pack contents: ${result.filename} (${result.entryCount} files)`);
  });
}

module.exports = {
  parsePackJson,
  verifyPackageEntries,
};
