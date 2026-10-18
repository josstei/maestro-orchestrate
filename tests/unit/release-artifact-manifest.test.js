'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
const { makeTempDir, writeTree } = require('../support/fs');
const { ROOT } = require('../support/paths');

describe('release artifact manifest', () => {
  it('uses an explicit allowlist for required release surfaces', () => {
    const expectedPaths = [
      'qwen-extension.json',
      'QWEN.md',
      'qwen',
      'agents',
      'commands',
      'policies',
      'mcp',
      'hooks',
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
    // Repo-root agents/ holds the Qwen agent stubs (Qwen loads <extension>/agents/).
    assert.equal(isReleaseArtifactPathAllowed('agents/coder.md'), true);
  });

  it('ships no Gemini CLI surfaces', () => {
    const removedPaths = [
      'gemini-extension.json',
      'GEMINI.md',
      '.geminiignore',
      'docs/runtime-gemini.md',
    ];

    for (const removedPath of removedPaths) {
      assert.equal(
        isReleaseArtifactPathAllowed(removedPath),
        false,
        `${removedPath} must not be allowlisted`
      );
    }
    for (const releasePath of RELEASE_ARTIFACT_PATHS) {
      assert.doesNotMatch(releasePath, /gemini/i);
    }
    for (const removedPath of ['gemini-extension.json', 'GEMINI.md', 'hooks/hooks.json', '.geminiignore']) {
      assert.equal(fs.existsSync(path.join(ROOT, removedPath)), false, `${removedPath} must not exist`);
    }
  });

  it('keeps denying local .gemini tool directories', () => {
    for (const deniedPath of ['.gemini', '.gemini_security']) {
      assert.ok(DENIED_ARTIFACT_PATHS.includes(deniedPath), `${deniedPath} must stay denied`);
      assert.equal(isDeniedPath(`${deniedPath}/settings.json`), true);
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
    const tempRoot = makeTempDir('maestro-release-unexpected-');
    fs.writeFileSync(path.join(tempRoot, 'unexpected-local-file.txt'), 'secret\n');

    assert.throws(
      () => assertReleaseArtifactContents(tempRoot),
      /Release artifact contains unallowlisted paths: unexpected-local-file\.txt/
    );
  });

  it('fails when extracted artifact contents contain denied file patterns', () => {
    const tempRoot = makeTempDir('maestro-release-denied-');
    writeTree(tempRoot, 'claude/scripts/policy-enforcer.test.js', 'test\n');

    assert.throws(
      () => assertReleaseArtifactContents(tempRoot),
      /Release artifact contains denied paths: claude\/scripts\/policy-enforcer\.test\.js/
    );
  });

  it('fails clearly when a required artifact path is missing', () => {
    const tempRoot = makeTempDir('maestro-release-manifest-');

    assert.throws(
      () => assertRequiredArtifactPaths(tempRoot),
      /Required release artifact paths are missing:/
    );
  });

  it('keeps all runtime manifest versions aligned with package.json', () => {
    assert.doesNotThrow(() => assertRuntimeManifestShape(ROOT));
  });
});
