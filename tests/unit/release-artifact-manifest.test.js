'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DENIED_ARTIFACT_PATHS,
  RELEASE_ARTIFACT_PATHS,
  RUNTIME_SOURCE_PATHS,
  assertReleaseArtifactContents,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  isDeniedPath,
  isReleaseArtifactPathAllowed,
} = require('../../scripts/release-artifact-manifest');

const ROOT = path.resolve(__dirname, '../..');
const BUILD_ONLY_SOURCE_PATHS = [
  'src/generator/file-writer.js',
  'src/transforms/index.js',
  'src/entry-points/registry.js',
  'src/lib/discovery/index.js',
  'src/lib/yaml-emit.js',
  'src/manifest.js',
  'src/platforms/metadata.js',
  'src/platforms/metadata-shared.js',
  'src/platforms/claude/metadata.js',
  'src/platforms/runtime-payload-contract.js',
];

describe('release artifact manifest', () => {
  it('uses an explicit allowlist for required release surfaces', () => {
    const expectedPaths = [
      'gemini-extension.json',
      'qwen-extension.json',
      '.claude-plugin/marketplace.json',
      '.claude-plugin/plugin.json',
      '.agents/plugins/marketplace.json',
      'claude/.mcp.json',
      'claude/agents',
      'claude/hooks',
      'claude/mcp',
      'claude/scripts',
      'claude/skills',
      'plugins/maestro/.codex-plugin',
      'plugins/maestro/.mcp.json',
      'plugins/maestro/references',
      'plugins/maestro/skills',
      'bin/maestro-install-codex.js',
      'bin/maestro-mcp-server.js',
    ];

    for (const expectedPath of expectedPaths) {
      assert.ok(
        RELEASE_ARTIFACT_PATHS.includes(expectedPath),
        `Expected release allowlist to include ${expectedPath}`
      );
    }

    for (const runtimeSourcePath of RUNTIME_SOURCE_PATHS) {
      assert.ok(
        RELEASE_ARTIFACT_PATHS.includes(runtimeSourcePath),
        `Expected release allowlist to include runtime source ${runtimeSourcePath}`
      );
    }

    assert.equal(RELEASE_ARTIFACT_PATHS.includes('src'), false);
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

  it('denies private root scripts in release artifacts', () => {
    assert.equal(isReleaseArtifactPathAllowed('scripts/generate.js'), false);
    assert.equal(isDeniedPath('scripts/generate.js'), true);
  });

  it('does not allow build-only source checkout tooling in release artifacts', () => {
    for (const buildOnlyPath of BUILD_ONLY_SOURCE_PATHS) {
      assert.equal(
        isReleaseArtifactPathAllowed(buildOnlyPath),
        false,
        `${buildOnlyPath} must not be release-allowlisted`
      );
    }
  });

  it('fails when extracted artifact contents contain build-only source checkout tooling', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-source-tooling-'));

    try {
      const buildOnlyPath = path.join(tempRoot, 'src', 'generator', 'file-writer.js');
      fs.mkdirSync(path.dirname(buildOnlyPath), { recursive: true });
      fs.writeFileSync(buildOnlyPath, 'module.exports = {};\n');

      assert.throws(
        () => assertReleaseArtifactContents(tempRoot),
        /Release artifact contains unallowlisted paths: src\/generator, src\/generator\/file-writer\.js/
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('allows only public bin files in release artifacts', () => {
    assert.equal(isReleaseArtifactPathAllowed('bin'), true);
    assert.equal(isReleaseArtifactPathAllowed('bin/maestro-install-codex.js'), true);
    assert.equal(isReleaseArtifactPathAllowed('bin/maestro-mcp-server.js'), true);
    assert.equal(isReleaseArtifactPathAllowed('bin/private-helper.js'), false);
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

  it('fails when extracted artifact contents contain retired detached payloads', () => {
    for (const [runtimeName, payloadPath, expectedPattern] of [
      ['claude', 'claude/src/version.json', /Release artifact contains denied paths: claude\/src/],
      ['codex', 'plugins/maestro/src/version.json', /Release artifact contains denied paths: plugins\/maestro\/src/],
    ]) {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `maestro-release-${runtimeName}-payload-`));

      try {
        const retiredPayloadFile = path.join(tempRoot, payloadPath);
        fs.mkdirSync(path.dirname(retiredPayloadFile), { recursive: true });
        fs.writeFileSync(retiredPayloadFile, '{"version":"0.0.0"}\n');

        assert.throws(
          () => assertReleaseArtifactContents(tempRoot),
          expectedPattern
        );
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
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
