'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DENIED_ARTIFACT_PATHS,
  RELEASE_ARTIFACT_PATHS,
  assertReleaseArtifactContents,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  isDeniedPath,
  isReleaseArtifactPathAllowed,
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

  it('denies test-only files inside otherwise allowlisted runtime roots', () => {
    const testFile = 'claude/scripts/policy-enforcer.test.js';

    assert.equal(isReleaseArtifactPathAllowed(testFile), true);
    assert.equal(isDeniedPath(testFile), true);
  });

  it('allows parent directories needed to reach explicitly allowlisted files', () => {
    assert.equal(isReleaseArtifactPathAllowed('docs'), true);
    assert.equal(isReleaseArtifactPathAllowed('.agents/plugins'), true);
    assert.equal(isReleaseArtifactPathAllowed('unexpected-local-file.txt'), false);
  });

  it('fails when extracted artifact contents are outside the allowlist', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-unexpected-'));

    try {
      fs.writeFileSync(path.join(tempRoot, 'unexpected-local-file.txt'), 'secret\n');

      assert.throws(
        () => assertReleaseArtifactContents(tempRoot),
        /Release artifact contains unallowlisted paths: unexpected-local-file\.txt/
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails when extracted artifact contents contain denied file patterns', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-denied-'));

    try {
      const testFile = path.join(tempRoot, 'claude', 'scripts', 'policy-enforcer.test.js');
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, 'test\n');

      assert.throws(
        () => assertReleaseArtifactContents(tempRoot),
        /Release artifact contains denied paths: claude\/scripts\/policy-enforcer\.test\.js/
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
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
