#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  RELEASE_ARTIFACT_PATHS,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  isDeniedPath,
  readJson,
} = require('./release-artifact-manifest');

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

  return {
    archivePath: argv[0] || null,
  };
}

function defaultArchivePath(root) {
  const version = readJson(root, 'package.json').version;
  return path.join(root, 'dist', 'release', `maestro-v${version}-extension.tar.gz`);
}

function extractArchive(archivePath, targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  execFileSync('tar', ['-xzf', archivePath, '-C', targetRoot], {
    stdio: 'inherit',
  });
}

function assertDeniedPathsAbsent(root) {
  const queue = ['.'];

  while (queue.length > 0) {
    const relativeDir = queue.pop();
    const absoluteDir = path.join(root, relativeDir);

    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.posix.join(relativeDir, entry.name).replace(/^\.\//, '');

      if (isDeniedPath(relativePath)) {
        throw new Error(`Release artifact contains denied path: ${relativePath}`);
      }

      if (entry.isDirectory()) {
        queue.push(relativePath);
      }
    }
  }
}

function assertOnlyManifestRoots(root) {
  for (const relativePath of RELEASE_ARTIFACT_PATHS) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      throw new Error(`Release artifact missing allowlisted path: ${relativePath}`);
    }
  }
}

function verifyReleaseArtifact(archivePath, options = {}) {
  const root = options.root || ROOT;
  const resolvedArchivePath = path.resolve(root, archivePath || defaultArchivePath(root));

  if (!fs.existsSync(resolvedArchivePath)) {
    throw new Error(`Release artifact not found: ${resolvedArchivePath}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-verify-'));

  try {
    extractArchive(resolvedArchivePath, tempRoot);
    assertOnlyManifestRoots(tempRoot);
    assertRequiredArtifactPaths(tempRoot);
    assertDeniedPathsAbsent(tempRoot);
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
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = verifyReleaseArtifact(args.archivePath);
    console.log(`Verified release artifact: ${path.relative(ROOT, result.archivePath)} (${result.version})`);
  } catch (error) {
    console.error(`release artifact verification failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  defaultArchivePath,
  parseArgs,
  verifyReleaseArtifact,
};
