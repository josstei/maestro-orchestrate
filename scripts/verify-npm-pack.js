#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  EXCLUDED_PACKAGE_PATHS,
  REQUIRED_PACKAGE_FILES,
  isDeniedPath,
} = require('./release-artifact-manifest');
const { runCli } = require('./lib/cli');
const { withTempDir } = require('./lib/temp-dir');

const ROOT = path.resolve(__dirname, '..');

function parsePackJson(stdout) {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`npm pack did not emit JSON output:\n${stdout}`);
  }

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
    if (isDeniedPath(entry)) {
      throw new Error(`npm package contains forbidden path: ${entry}`);
    }
    // scripts/ ships only the required installer files.
    if ((entry.startsWith('scripts/') && !REQUIRED_PACKAGE_FILES.includes(entry)) ||
      EXCLUDED_PACKAGE_PATHS.some((excluded) => entry === excluded || entry.startsWith(`${excluded}/`))) {
      throw new Error(`npm package contains build-only path: ${entry}`);
    }
  }

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
