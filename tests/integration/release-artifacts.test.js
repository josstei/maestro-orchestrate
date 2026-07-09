import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTempRepoCopy } from './helpers.js';
import { packageReleaseArtifacts } from '../../dist/src/tooling/package-release-artifacts.js';
import { verifyReleaseArtifact } from '../../dist/src/tooling/verify-release-artifacts.js';
import {
  BUILD_ONLY_DIST_ARCHIVE_PATHS,
  BUILD_ONLY_SOURCE_ARCHIVE_PATHS,
} from '../support/contracts.js';

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
      assert.equal(archiveEntries.some((entry) => entry === './src/' || entry.startsWith('./src/')), false);
      assert.equal(archiveEntries.some((entry) => entry === './scripts/' || entry.startsWith('./scripts/')), false);
      assert.equal(archiveEntries.some((entry) => entry === './bin/' || entry.startsWith('./bin/')), false);
      assert.equal(archiveEntries.some((entry) => entry.endsWith('.d.ts')), false);
      assert.equal(archiveEntries.some((entry) => entry.endsWith('.map')), false);
      assert.equal(archiveEntries.includes('./claude/scripts/policy-enforcer.test.js'), false);
      assert.ok(archiveEntries.includes('./dist/src/bin/maestro-install-codex.js'));
      assert.ok(archiveEntries.includes('./dist/src/bin/maestro-mcp-server.js'));
      assert.ok(archiveEntries.includes('./dist/src/generated/runtime-content-registry.json'));
      assert.ok(archiveEntries.includes('./dist/src/generated/runtime-content-registry.txt.gz'));
      assert.ok(archiveEntries.includes('./dist/src/mcp/maestro-server.js'));
      assert.ok(archiveEntries.includes('./dist/src/lib/framework-detection.js'));
      assert.ok(archiveEntries.includes('./dist/src/platforms/codex/runtime-config.js'));
      for (const retiredContentRoot of [
        './dist/src/agents/',
        './dist/src/references/',
        './dist/src/skills/',
        './dist/src/templates/',
      ]) {
        assert.equal(
          archiveEntries.some((entry) => entry.startsWith(retiredContentRoot)),
          false,
          `${retiredContentRoot} must not be archived as raw runtime content`
        );
      }
      for (const buildOnlyPath of BUILD_ONLY_SOURCE_ARCHIVE_PATHS) {
        assert.equal(archiveEntries.includes(buildOnlyPath), false, `${buildOnlyPath} must not be archived`);
      }
      for (const buildOnlyPath of BUILD_ONLY_DIST_ARCHIVE_PATHS) {
        assert.equal(archiveEntries.includes(buildOnlyPath), false, `${buildOnlyPath} must not be archived`);
      }
      assert.equal(
        archiveEntries.some((entry) => entry.startsWith('./src/generator/')),
        false
      );
      assert.equal(
        archiveEntries.some((entry) => entry.startsWith('./src/transforms/')),
        false
      );
      assert.equal(
        archiveEntries.some((entry) => entry.startsWith('./src/entry-points/')),
        false
      );
      assert.equal(
        archiveEntries.some((entry) => entry.startsWith('./src/lib/discovery/')),
        false
      );
      assert.equal(
        archiveEntries.some((entry) => /^\.\/src\/platforms\/[^/]+\/metadata\.ts$/.test(entry)),
        false
      );
      assert.equal(
        archiveEntries.some((entry) => entry.startsWith('./dist/src/generator/')),
        false
      );
      assert.equal(
        archiveEntries.some((entry) => entry.startsWith('./dist/src/transforms/')),
        false
      );
      assert.equal(
        archiveEntries.some((entry) => entry.startsWith('./dist/src/entry-points/')),
        false
      );
      assert.equal(
        archiveEntries.some((entry) => entry.startsWith('./dist/src/lib/discovery/')),
        false
      );
      assert.equal(
        archiveEntries.some((entry) => /^\.\/dist\/src\/platforms\/[^/]+\/metadata\.js$/.test(entry)),
        false
      );
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

  it('rejects an archive with build-only source checkout tooling', () => {
    const repoRoot = createTempRepoCopy('maestro-release-source-tooling-');
    const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-source-tooling-extract-'));

    try {
      const { archivePath } = packageReleaseArtifacts({
        root: repoRoot,
        outDir: 'dist/release',
      });
      execFileSync('tar', ['-xzf', archivePath, '-C', extractRoot]);
      const buildOnlyPath = path.join(extractRoot, 'src', 'generator', 'private.js');
      fs.mkdirSync(path.dirname(buildOnlyPath), { recursive: true });
      fs.writeFileSync(buildOnlyPath, 'module.exports = {};\n');

      const extraArchivePath = path.join(path.dirname(archivePath), 'maestro-source-tooling-extension.tar.gz');
      execFileSync('tar', ['-czf', extraArchivePath, '-C', extractRoot, '.']);

      assert.throws(
        () => verifyReleaseArtifact(extraArchivePath, { root: repoRoot }),
        /Release artifact contains denied paths: src, src\/generator, src\/generator\/private\.js/
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
