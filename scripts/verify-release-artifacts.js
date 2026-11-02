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
const { runCli } = require('./lib/cli');

const ROOT = path.resolve(__dirname, '..');

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

runCli(module, {
  failure: 'release artifact verification failed',
  positional: 'archive path',
  usage: `Verify a Maestro release artifact.

Usage:
  node scripts/verify-release-artifacts.js [archive]

If archive is omitted, the verifier checks:
  dist/release/maestro-v<package.json version>-extension.tar.gz
`,
}, ({ positionals: [archivePath] }) => {
  const result = verifyReleaseArtifact(archivePath);
  console.log(`Verified release artifact: ${path.relative(ROOT, result.archivePath)} (${result.version})`);
});

module.exports = {
  verifyReleaseArtifact,
};
