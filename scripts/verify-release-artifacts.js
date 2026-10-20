#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  assertReleaseArtifactContents,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  readJson,
  releaseArchivePath,
} = require('./lib/release');
const { runCli } = require('./lib/cli');

const ROOT = path.resolve(__dirname, '..');

function printHelp() {
  console.log(`Verify a Maestro release artifact.

Usage:
  node scripts/verify-release-artifacts.js [archive]

If archive is omitted, the verifier checks:
  dist/release/maestro-v<package.json version>-extension.tar.gz
`);
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (argv.length > 1) {
    throw new Error('Expected at most one archive path');
  }

  return argv[0];
}

function verifyReleaseArtifact(archivePath) {
  const resolvedArchivePath = archivePath
    ? path.resolve(ROOT, archivePath)
    : releaseArchivePath(ROOT, readJson(ROOT, 'package.json').version);

  if (!fs.existsSync(resolvedArchivePath)) {
    throw new Error(`Release artifact not found: ${resolvedArchivePath}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-verify-'));

  try {
    execFileSync('tar', ['-xzf', resolvedArchivePath, '-C', tempRoot], {
      stdio: 'inherit',
    });
    assertRequiredArtifactPaths(tempRoot);
    assertReleaseArtifactContents(tempRoot);
    const version = assertRuntimeManifestShape(tempRoot);

    return {
      archivePath: resolvedArchivePath,
      version,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runCli('release artifact verification failed', () => {
    const result = verifyReleaseArtifact(parseArgs(process.argv.slice(2)));
    console.log(`Verified release artifact: ${path.relative(ROOT, result.archivePath)} (${result.version})`);
  });
}

module.exports = {
  verifyReleaseArtifact,
};
