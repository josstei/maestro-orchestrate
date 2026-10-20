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
const { editJson, makeTempDir, readJson, writeTree } = require('../support/fs');
const { ROOT } = require('../support/paths');

// Every file assertRuntimeManifestShape reads or requires.
const RUNTIME_MANIFEST_FILES = [
  '.agents/plugins/marketplace.json',
  '.claude-plugin/marketplace.json',
  'antigravity/hooks.json',
  'antigravity/mcp_config.json',
  'antigravity/plugin.json',
  'antigravity/src/mcp/maestro-server.js',
  'antigravity/src/version.json',
  'bin/maestro-mcp-server.js',
  'claude/.claude-plugin/plugin.json',
  'claude/.mcp.json',
  'claude/src/mcp/maestro-server.js',
  'claude/src/version.json',
  'package.json',
  'plugins/maestro/.codex-plugin/plugin.json',
  'plugins/maestro/.mcp.json',
  'plugins/maestro/src/mcp/maestro-server.js',
  'plugins/maestro/src/version.json',
  'qwen-extension.json',
];

function copyRuntimeManifests() {
  const tempRoot = makeTempDir('maestro-release-runtime-');
  for (const relativePath of RUNTIME_MANIFEST_FILES) {
    fs.mkdirSync(path.dirname(path.join(tempRoot, relativePath)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relativePath), path.join(tempRoot, relativePath));
  }
  return tempRoot;
}

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
      'antigravity',
      'docs/runtime-antigravity.md',
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
    assert.equal(isReleaseArtifactPathAllowed('antigravity/agents/coder.md'), true);
    assert.equal(isReleaseArtifactPathAllowed('antigravity/src/mcp/maestro-server.js'), true);
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

  it('names a missing antigravity runtime doc', () => {
    const tempRoot = makeTempDir('maestro-release-antigravity-doc-');
    for (const releasePath of RELEASE_ARTIFACT_PATHS.filter((entry) => entry !== 'docs/runtime-antigravity.md')) {
      writeTree(tempRoot, releasePath);
    }

    assert.throws(
      () => assertRequiredArtifactPaths(tempRoot),
      { message: 'Required release artifact paths are missing: docs/runtime-antigravity.md' }
    );
  });

  it('keeps all runtime manifest versions aligned with package.json', () => {
    assert.doesNotThrow(() => assertRuntimeManifestShape(ROOT));
  });

  it('checks the antigravity plugin and detached payload versions', () => {
    const pkgVersion = readJson(path.join(ROOT, 'package.json')).version;
    assert.equal(assertRuntimeManifestShape(copyRuntimeManifests()), pkgVersion);

    for (const relativePath of ['antigravity/plugin.json', 'antigravity/src/version.json']) {
      const tempRoot = copyRuntimeManifests();
      editJson(path.join(tempRoot, relativePath), (content) => {
        content.version = '0.0.0';
      });

      assert.throws(
        () => assertRuntimeManifestShape(tempRoot),
        { message: `Release manifest version mismatch; expected ${pkgVersion}: ${relativePath}=0.0.0` }
      );
    }
  });

  it('requires the antigravity plugin to be named maestro', () => {
    const tempRoot = copyRuntimeManifests();
    editJson(path.join(tempRoot, 'antigravity/plugin.json'), (manifest) => {
      manifest.name = 'maestro-orchestrate';
    });

    assert.throws(
      () => assertRuntimeManifestShape(tempRoot),
      { message: 'antigravity/plugin.json must name the plugin maestro' }
    );
  });

  it('requires antigravity/mcp_config.json to launch the bundled MCP server', () => {
    const edits = [
      (config) => { delete config.mcpServers.maestro; },
      (config) => { config.mcpServers.maestro.command = 'npx'; },
      (config) => { config.mcpServers.maestro.args = ['${PLUGIN_ROOT}/src/mcp/maestro-server.js']; },
    ];

    for (const edit of edits) {
      const tempRoot = copyRuntimeManifests();
      editJson(path.join(tempRoot, 'antigravity/mcp_config.json'), edit);

      assert.throws(
        () => assertRuntimeManifestShape(tempRoot),
        { message: 'antigravity/mcp_config.json must launch the bundled Maestro MCP server' }
      );
    }
  });

  it('requires the antigravity hooks config and bundled MCP server', () => {
    for (const relativePath of ['antigravity/hooks.json', 'antigravity/src/mcp/maestro-server.js']) {
      const tempRoot = copyRuntimeManifests();
      fs.rmSync(path.join(tempRoot, relativePath));

      assert.throws(
        () => assertRuntimeManifestShape(tempRoot),
        { message: `Required runtime file missing: ${relativePath}` }
      );
    }
  });
});
