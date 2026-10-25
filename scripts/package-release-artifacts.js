#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  RELEASE_ARTIFACT_PATHS,
  RELEASE_OUT_DIR,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  isDeniedPath,
  isReleaseArtifactPathAllowed,
  readJson,
  releaseArchiveName,
} = require('./release-artifact-manifest');
const { parseFlagArgs, runCli } = require('./lib/cli');
const { withTempDir } = require('./lib/temp-dir');

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
    defaults: { version: null, outDir: RELEASE_OUT_DIR },
    flags: { '--version': 'version', '--out-dir': 'outDir' },
    printHelp,
  });
}

function resolveVersion(root, requestedVersion) {
  const packageVersion = readJson(root, 'package.json').version;
  const version = requestedVersion || packageVersion;

  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release artifact version: ${version}`);
  }

  return version;
}

function copyPath(root, stagingRoot, relativePath) {
  const assertNoSymlink = (source) => {
    if (fs.lstatSync(source).isSymbolicLink()) {
      throw new Error(`Release artifact contains symbolic link: ${path.relative(root, source).split(path.sep).join('/')}`);
    }
  };
  // Some allowlisted files have parents that are not copied as roots (docs/
  // and marketplace directories). Validate those ancestors as well.
  let source = root;
  for (const segment of relativePath.split('/')) {
    source = path.join(source, segment);
    assertNoSymlink(source);
  }
  fs.cpSync(path.join(root, relativePath), path.join(stagingRoot, relativePath), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(root, source);
      if (!isReleaseArtifactPathAllowed(relative) || isDeniedPath(relative)) return false;
      assertNoSymlink(source);
      return true;
    },
  });
}

function createTarball(stagingRoot, archivePath) {
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.rmSync(archivePath, { force: true });

  execFileSync('tar', ['-czf', archivePath, '-C', stagingRoot, '.'], {
    stdio: 'inherit',
  });
}

function packageReleaseArtifacts(options = {}) {
  const root = options.root || ROOT;
  const version = resolveVersion(root, options.version);
  const outDir = path.resolve(root, options.outDir || RELEASE_OUT_DIR);
  const archivePath = path.join(outDir, releaseArchiveName(version));
  return withTempDir('maestro-release-artifact-', (tempRoot) => {
    const stagingRoot = path.join(tempRoot, 'maestro');
    assertRequiredArtifactPaths(root);
    assertRuntimeManifestShape(root, version);
    fs.mkdirSync(stagingRoot, { recursive: true });

    for (const relativePath of RELEASE_ARTIFACT_PATHS) {
      copyPath(root, stagingRoot, relativePath);
    }

    assertRuntimeManifestShape(stagingRoot, version);
    createTarball(stagingRoot, archivePath);

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
