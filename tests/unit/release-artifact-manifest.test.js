'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DENIED_ARTIFACT_PATHS,
  RELEASE_ARTIFACT_PATHS,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  isDeniedPath,
} = require('../../scripts/release-artifact-manifest');

const ROOT = path.resolve(__dirname, '../..');

describe('release artifact manifest', () => {
  it('uses an explicit allowlist for required release surfaces', () => {
    const expectedPaths = [
      'gemini-extension.json',
      'qwen-extension.json',
      '.claude-plugin/marketplace.json',
      '.agents/plugins/marketplace.json',
      'claude',
      'plugins/maestro',
      'bin',
      'src',
    ];

    for (const expectedPath of expectedPaths) {
      assert.ok(
        RELEASE_ARTIFACT_PATHS.includes(expectedPath),
        `Expected release allowlist to include ${expectedPath}`
      );
    }
  });

  it('does not include denied paths in the release allowlist', () => {
    for (const releasePath of RELEASE_ARTIFACT_PATHS) {
      assert.equal(isDeniedPath(releasePath), false, `${releasePath} must not be denied`);
    }

    for (const deniedPath of DENIED_ARTIFACT_PATHS) {
      assert.equal(isDeniedPath(deniedPath), true, `${deniedPath} should be denied`);
      assert.equal(isDeniedPath(`${deniedPath}/nested.txt`), true, `${deniedPath}/nested.txt should be denied`);
    }
  });

  it('fails clearly when a required artifact path is missing', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-manifest-'));

    try {
      assert.throws(
        () => assertRequiredArtifactPaths(tempRoot),
        /Required release artifact paths are missing:/
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps all runtime manifest versions aligned with package.json', () => {
    assert.doesNotThrow(() => assertRuntimeManifestShape(ROOT));
  });
});
