#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  assertReleaseArtifact,
  ensure,
  readJson,
  releaseArchivePath,
  withTempDir,
} = require('./release-artifact-manifest');
const { parseFlagArgs, runCli } = require('./lib/cli');

const ROOT = path.resolve(__dirname, '..');

function printHelp() {
  console.log(`Verify a Maestro release artifact.

Usage:
  node scripts/verify-release-artifacts.js [archive]

If archive is omitted, the verifier checks:
  dist/release/maestro-v<package.json version>-extension.tar.gz
`);
}

function verifyReleaseArtifact(archivePath, options = {}) {
  const root = options.root || ROOT;
  const resolvedArchivePath = archivePath
    ? path.resolve(root, archivePath)
    : releaseArchivePath(root, readJson(root, 'package.json').version);
  ensure(fs.existsSync(resolvedArchivePath), `Release artifact not found: ${resolvedArchivePath}`);

  return withTempDir('maestro-release-verify-', (tempRoot) => {
    execFileSync('tar', ['-xzf', resolvedArchivePath, '-C', tempRoot], {
      stdio: 'inherit',
    });

    return {
      archivePath: resolvedArchivePath,
      version: assertReleaseArtifact(tempRoot),
    };
  });
}

if (require.main === module) {
  runCli('release artifact verification failed', () => {
    const { positionals: [archivePath] } = parseFlagArgs(process.argv.slice(2), { positional: 'archive path', printHelp });
    const result = verifyReleaseArtifact(archivePath);
    console.log(`Verified release artifact: ${path.relative(ROOT, result.archivePath)} (${result.version})`);
  });
}

module.exports = {
  verifyReleaseArtifact,
};
