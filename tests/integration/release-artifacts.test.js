'use strict';

const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { makeTempDir, removeDir } = require('../support/fs');
const { createTempRepoCopy, withTempRepoCopy } = require('./helpers');
const { packageReleaseArtifacts } = require('../../scripts/package-release-artifacts');
const { verifyReleaseArtifact } = require('../../scripts/verify-release-artifacts');

/**
 * Extracts `archivePath` into a scratch directory, lets `mutate` edit the
 * extracted tree, repacks it as `name` in that scratch directory and passes
 * the repacked archive path to `fn`. The scratch directory is removed
 * afterwards; the source archive is never modified.
 *
 * @template T
 * @param {string} archivePath - Archive to extract
 * @param {string} name - File name for the repacked archive
 * @param {(extractRoot: string) => void} mutate - Edits the extracted tree
 * @param {(repackedPath: string) => T} fn - Synchronous callback receiving the repacked archive path
 * @returns {T} The callback's result
 */
function withRepackedArchive(archivePath, name, mutate, fn) {
  const workRoot = makeTempDir('maestro-release-repack-');
  const extractRoot = path.join(workRoot, 'extract');
  const repackedPath = path.join(workRoot, name);

  try {
    fs.mkdirSync(extractRoot);
    execFileSync('tar', ['-xzf', archivePath, '-C', extractRoot]);
    mutate(extractRoot);
    execFileSync('tar', ['-czf', repackedPath, '-C', extractRoot, '.']);
    return fn(repackedPath);
  } finally {
    removeDir(workRoot);
  }
}

describe('release artifact packaging', () => {
  // One repo copy and one packaged archive shared by the read-only tests;
  // corrupted variants are repacked elsewhere so neither is ever modified.
  let repoRoot = null;
  let packaged = null;

  before(() => {
    repoRoot = createTempRepoCopy('maestro-release-artifact-');
    packaged = packageReleaseArtifacts({ root: repoRoot, outDir: 'dist/release' });
  });

  after(() => {
    if (repoRoot) {
      removeDir(path.dirname(repoRoot));
    }
  });

  it('builds and verifies a self-contained release archive from a repo copy', () => {
    const { archivePath, version } = packaged;
    const result = verifyReleaseArtifact(archivePath, { root: repoRoot });

    assert.equal(result.version, version);
    assert.equal(fs.existsSync(archivePath), true);
    assert.match(path.basename(archivePath), /^maestro-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-extension\.tar\.gz$/);

    const archiveEntries = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' })
      .trim()
      .split('\n');
    assert.equal(archiveEntries.includes('./claude/scripts/policy-enforcer.test.js'), false);
  });

  it('rejects an archive with manifest version drift', () => {
    withRepackedArchive(
      packaged.archivePath,
      'maestro-corrupt-extension.tar.gz',
      (extractRoot) => {
        const qwenManifestPath = path.join(extractRoot, 'qwen-extension.json');
        const qwenManifest = JSON.parse(fs.readFileSync(qwenManifestPath, 'utf8'));
        qwenManifest.version = '0.0.0';
        fs.writeFileSync(qwenManifestPath, `${JSON.stringify(qwenManifest, null, 2)}\n`, 'utf8');
      },
      (corruptArchivePath) => {
        assert.throws(
          () => verifyReleaseArtifact(corruptArchivePath, { root: repoRoot }),
          /Release manifest version mismatch/
        );
      }
    );
  });

  it('rejects an archive with extra unallowlisted files', () => {
    withRepackedArchive(
      packaged.archivePath,
      'maestro-extra-extension.tar.gz',
      (extractRoot) => {
        fs.writeFileSync(path.join(extractRoot, 'unexpected-local-file.txt'), 'secret\n');
      },
      (extraArchivePath) => {
        assert.throws(
          () => verifyReleaseArtifact(extraArchivePath, { root: repoRoot }),
          /Release artifact contains unallowlisted paths: unexpected-local-file\.txt/
        );
      }
    );
  });

  it('fails packaging when a required runtime surface is missing', () => {
    withTempRepoCopy('maestro-release-missing-', (missingRoot) => {
      fs.rmSync(path.join(missingRoot, 'qwen-extension.json'));

      assert.throws(
        () => packageReleaseArtifacts({ root: missingRoot, outDir: 'dist/release' }),
        /Required release artifact paths are missing: qwen-extension\.json/
      );
    });
  });
});
