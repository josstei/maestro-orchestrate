#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  RELEASE_OUT_DIR,
  assertReleaseArtifactContents,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  readJson,
  releaseArchiveName,
} = require('./release-artifact-manifest');
const { parseFlagArgs, runCli } = require('./lib/cli');
const { withTempDir } = require('./lib/temp-dir');

const ROOT = path.resolve(__dirname, '..');

function printHelp() {
  console.log(`Verify a Maestro release artifact.

Usage:
  node scripts/verify-release-artifacts.js [archive]

If archive is omitted, the verifier checks:
  dist/release/maestro-v<package.json version>-extension.tar.gz
`);
}

function defaultArchivePath(root) {
  const version = readJson(root, 'package.json').version;
  return path.join(root, RELEASE_OUT_DIR, releaseArchiveName(version));
}

function extractArchive(archivePath, targetRoot) {
  execFileSync('tar', ['-xzf', archivePath, '-C', targetRoot], {
    stdio: 'inherit',
  });
}

function verifyReleaseArtifact(archivePath, options = {}) {
  const root = options.root || ROOT;
  const resolvedArchivePath = path.resolve(root, archivePath || defaultArchivePath(root));

  if (!fs.existsSync(resolvedArchivePath)) {
    throw new Error(`Release artifact not found: ${resolvedArchivePath}`);
  }

  return withTempDir('maestro-release-verify-', (tempRoot) => {
    extractArchive(resolvedArchivePath, tempRoot);
    assertRequiredArtifactPaths(tempRoot);
    assertReleaseArtifactContents(tempRoot);
    const version = assertRuntimeManifestShape(tempRoot);

    return {
      archivePath: resolvedArchivePath,
      version,
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
