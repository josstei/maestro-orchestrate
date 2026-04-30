'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { createTempRepoCopy } = require('./helpers');
const { packageReleaseArtifacts } = require('../../scripts/package-release-artifacts');
const { verifyReleaseArtifact } = require('../../scripts/verify-release-artifacts');

function cleanupRepoCopy(repoRoot) {
  fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
}

describe('release artifact packaging', () => {
  it('builds and verifies a self-contained release archive from a repo copy', () => {
    const repoRoot = createTempRepoCopy('maestro-release-artifact-');

    try {
      const { archivePath, version } = packageReleaseArtifacts({
        root: repoRoot,
        outDir: 'dist/release',
      });
      const result = verifyReleaseArtifact(archivePath, { root: repoRoot });

      assert.equal(result.version, version);
      assert.equal(fs.existsSync(archivePath), true);
      assert.match(path.basename(archivePath), /^maestro-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-extension\.tar\.gz$/);

      const archiveEntries = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' })
        .trim()
        .split('\n');
      assert.equal(archiveEntries.includes('./claude/scripts/policy-enforcer.test.js'), false);
    } finally {
      cleanupRepoCopy(repoRoot);
    }
  });

  it('rejects an archive with manifest version drift', () => {
    const repoRoot = createTempRepoCopy('maestro-release-corrupt-');
    const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-corrupt-extract-'));

    try {
      const { archivePath } = packageReleaseArtifacts({
        root: repoRoot,
        outDir: 'dist/release',
      });
      execFileSync('tar', ['-xzf', archivePath, '-C', extractRoot]);

      const qwenManifestPath = path.join(extractRoot, 'qwen-extension.json');
      const qwenManifest = JSON.parse(fs.readFileSync(qwenManifestPath, 'utf8'));
      qwenManifest.version = '0.0.0';
      fs.writeFileSync(qwenManifestPath, `${JSON.stringify(qwenManifest, null, 2)}\n`, 'utf8');

      const corruptArchivePath = path.join(path.dirname(archivePath), 'maestro-corrupt-extension.tar.gz');
      execFileSync('tar', ['-czf', corruptArchivePath, '-C', extractRoot, '.']);

      assert.throws(
        () => verifyReleaseArtifact(corruptArchivePath, { root: repoRoot }),
        /Release manifest version mismatch/
      );
    } finally {
      fs.rmSync(extractRoot, { recursive: true, force: true });
      cleanupRepoCopy(repoRoot);
    }
  });

  it('rejects an archive with extra unallowlisted files', () => {
    const repoRoot = createTempRepoCopy('maestro-release-extra-');
    const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-extra-extract-'));

    try {
      const { archivePath } = packageReleaseArtifacts({
        root: repoRoot,
        outDir: 'dist/release',
      });
      execFileSync('tar', ['-xzf', archivePath, '-C', extractRoot]);
      fs.writeFileSync(path.join(extractRoot, 'unexpected-local-file.txt'), 'secret\n');

      const extraArchivePath = path.join(path.dirname(archivePath), 'maestro-extra-extension.tar.gz');
      execFileSync('tar', ['-czf', extraArchivePath, '-C', extractRoot, '.']);

      assert.throws(
        () => verifyReleaseArtifact(extraArchivePath, { root: repoRoot }),
        /Release artifact contains unallowlisted paths: unexpected-local-file\.txt/
      );
    } finally {
      fs.rmSync(extractRoot, { recursive: true, force: true });
      cleanupRepoCopy(repoRoot);
    }
  });

  it('fails packaging when a required runtime surface is missing', () => {
    const repoRoot = createTempRepoCopy('maestro-release-missing-');

    try {
      fs.rmSync(path.join(repoRoot, 'qwen-extension.json'));

      assert.throws(
        () => packageReleaseArtifacts({ root: repoRoot, outDir: 'dist/release' }),
        /Required release artifact paths are missing: qwen-extension\.json/
      );
    } finally {
      cleanupRepoCopy(repoRoot);
    }
  });
});
