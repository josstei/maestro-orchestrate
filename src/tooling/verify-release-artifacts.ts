#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  assertReleaseArtifactContents,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  readJson,
} from './release-artifact-manifest.js';

import { moduleDirname } from '../core/module-path.js';
import { resolvePackageRoot } from '../core/package-root.js';
import { runAsMain } from './lib/cli.js';
const ROOT = resolvePackageRoot(moduleDirname(import.meta.url), { malformedJson: 'throw' });

type VerifyReleaseOptions = {
  root?: string;
};

type ParsedVerifyReleaseArgs = {
  archivePath: string | null;
};

type VerifyReleaseResult = {
  archivePath: string;
  version: string;
};

function printHelp() {
  console.log(`Verify a Maestro release artifact.

Usage:
  node dist/src/tooling/verify-release-artifacts.js [archive]

If archive is omitted, the verifier checks:
  dist/release/maestro-v<package.json version>-extension.tar.gz
`);
}

function parseArgs(argv: string[]): ParsedVerifyReleaseArgs {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (argv.length > 1) {
    throw new Error('Expected at most one archive path');
  }

  return {
    archivePath: argv[0] ?? null,
  };
}

function defaultArchivePath(root: string): string {
  const version = readJson(root, 'package.json').version;
  return path.join(root, 'dist', 'release', `maestro-v${version}-extension.tar.gz`);
}

function extractArchive(archivePath: string, targetRoot: string): void {
  fs.mkdirSync(targetRoot, { recursive: true });
  execFileSync('tar', ['-xzf', archivePath, '-C', targetRoot], {
    stdio: 'inherit',
  });
}

function verifyReleaseArtifact(archivePath: string | null, options: VerifyReleaseOptions = {}): VerifyReleaseResult {
  const root = options.root || ROOT;
  const resolvedArchivePath = path.resolve(root, archivePath || defaultArchivePath(root));

  if (!fs.existsSync(resolvedArchivePath)) {
    throw new Error(`Release artifact not found: ${resolvedArchivePath}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-verify-'));

  try {
    extractArchive(resolvedArchivePath, tempRoot);
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

runAsMain(import.meta.url, 'release artifact verification', () => {
  const args = parseArgs(process.argv.slice(2));
  const result = verifyReleaseArtifact(args.archivePath);
  console.log(`Verified release artifact: ${path.relative(ROOT, result.archivePath)} (${result.version})`);
});

export { defaultArchivePath, parseArgs, verifyReleaseArtifact };
