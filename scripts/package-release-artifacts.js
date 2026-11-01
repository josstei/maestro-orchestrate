#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  RELEASE_ARTIFACT_PATHS,
  assertReleaseArtifact,
  assertRequiredArtifactPaths,
  ensure,
  isDeniedPath,
  isReleaseArtifactPathAllowed,
  readJson,
  releaseArchivePath,
  withTempDir,
} = require('./release-artifact-manifest');
const { parseFlagArgs, runCli } = require('./lib/cli');

const ROOT = path.resolve(__dirname, '..');

function printHelp() {
  console.log(`Package Maestro release artifacts.

Usage:
  node scripts/package-release-artifacts.js [--version X.Y.Z] [--out-dir dist/release]

Options:
  --version  Version to package. Defaults to package.json version.
  --out-dir  Directory for the generated archive. Defaults to dist/release.
  --help     Show this help text.
`);
}

function parseArgs(argv) {
  return parseFlagArgs(argv, {
    defaults: { version: null, outDir: null },
    flags: { '--version': 'version', '--out-dir': 'outDir' },
    printHelp,
  });
}

// Refuses symlinks before copying, including the ancestors of allowlisted files that are
// not copied as roots (docs/ and the marketplace directories).
function copyPath(root, stagingRoot, relativePath) {
  const ensureNoSymlink = (relative) => ensure(!fs.lstatSync(path.join(root, relative)).isSymbolicLink(),
    `Release artifact contains symbolic link: ${relative.split(path.sep).join('/')}`);
  const segments = relativePath.split('/');
  segments.forEach((_, index) => ensureNoSymlink(segments.slice(0, index + 1).join('/')));
  fs.cpSync(path.join(root, relativePath), path.join(stagingRoot, relativePath), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(root, source);
      return isReleaseArtifactPathAllowed(relative) && !isDeniedPath(relative) && ensureNoSymlink(relative);
    },
  });
}

function packageReleaseArtifacts(options = {}) {
  const root = options.root || ROOT;
  const packageVersion = readJson(root, 'package.json').version;
  const version = options.version || packageVersion;
  ensure(typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version),
    `Invalid release artifact version: ${version}`);
  const archivePath = releaseArchivePath(root, version, options.outDir);
  return withTempDir('maestro-release-artifact-', (tempRoot) => {
    const stagingRoot = path.join(tempRoot, 'maestro');
    assertRequiredArtifactPaths(root);
    fs.mkdirSync(stagingRoot, { recursive: true });

    for (const relativePath of RELEASE_ARTIFACT_PATHS) {
      copyPath(root, stagingRoot, relativePath);
    }

    assertReleaseArtifact(stagingRoot, version);
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.rmSync(archivePath, { force: true });
    execFileSync('tar', ['-czf', archivePath, '-C', stagingRoot, '.'], {
      stdio: 'inherit',
    });

    return {
      archivePath,
      version,
    };
  });
}

if (require.main === module) {
  runCli('release artifact packaging failed', () => {
    const result = packageReleaseArtifacts(parseArgs(process.argv.slice(2)));
    console.log(`Created release artifact: ${path.relative(ROOT, result.archivePath)}`);
  });
}

module.exports = {
  packageReleaseArtifacts,
};
