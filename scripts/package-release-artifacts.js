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
  toPosixPath,
} = require('./release-artifact-manifest');

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
  const options = {
    version: null,
    outDir: 'dist/release',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--version') {
      options.version = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--out-dir') {
      options.outDir = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.version === undefined || options.outDir === undefined) {
    throw new Error('Missing value for release artifact option');
  }

  return options;
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
  if (isDeniedPath(relativePath)) {
    throw new Error(`Refusing to package denied path: ${relativePath}`);
  }

  const sourcePath = path.join(root, relativePath);
  const targetPath = path.join(stagingRoot, relativePath);
  const sourceStat = fs.statSync(sourcePath);

  if (sourceStat.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, {
      recursive: true,
      filter: (source) => {
        const sourceRelativePath = toPosixPath(path.relative(root, source));
        return !sourceRelativePath || !isDeniedPath(sourceRelativePath);
      },
    });
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  fs.chmodSync(targetPath, sourceStat.mode);
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
  const version = resolveVersion(root, options.version || null);
  const outDir = path.resolve(root, options.outDir || 'dist/release');
  const archivePath = path.join(outDir, `maestro-v${version}-extension.tar.gz`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-artifact-'));
  const stagingRoot = path.join(tempRoot, 'maestro');

  try {
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
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const result = packageReleaseArtifacts(parseArgs(process.argv.slice(2)));
    console.log(`Created release artifact: ${path.relative(ROOT, result.archivePath)}`);
  } catch (error) {
    console.error(`release artifact packaging failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  packageReleaseArtifacts,
  parseArgs,
  resolveVersion,
};
