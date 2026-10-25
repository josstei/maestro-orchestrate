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
  'antigravity/hooks/hook-runner.js',
  'antigravity/hooks/policy-enforcer.js',
  'antigravity/hooks.json',
  'antigravity/mcp/maestro-server.js',
  'antigravity/mcp_config.json',
  'antigravity/plugin.json',
  'antigravity/src/mcp/maestro-server.js',
  'antigravity/src/version.json',
  'bin/maestro-mcp-server.js',
  'claude/.claude-plugin/plugin.json',
  'claude/.mcp.json',
  'claude/hooks/claude-hooks.json',
  'claude/mcp/maestro-server.js',
  'claude/scripts/hook-runner.js',
  'claude/scripts/policy-enforcer.js',
  'claude/src/mcp/maestro-server.js',
  'claude/src/version.json',
  'hooks/hook-runner.js',
  'mcp/maestro-server.js',
  'package.json',
  'plugins/maestro/.app.json',
  'plugins/maestro/.codex-plugin/plugin.json',
  'plugins/maestro/.mcp.json',
  'plugins/maestro/src/mcp/maestro-server.js',
  'plugins/maestro/src/version.json',
  'qwen-extension.json',
  'qwen/hooks.json',
  'src/mcp/maestro-server.js',
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
  it('denies nested development, test, cache and scratch paths without matching runtime names', () => {
    for (const forbidden of [
      'claude/tests/fixtures/helper.js', 'antigravity/.cache/probe.json',
      'src/tmp/probe.txt', 'plugins/maestro/node_modules/acorn/index.js',
      'src/scratch/notes.md', 'src/coverage/report.html', 'src/.git/config',
    ]) {
      assert.equal(isDeniedPath(forbidden), true, forbidden);
      const root = makeTempDir('maestro-artifact-nested-');
      writeTree(root, forbidden, 'fixture\n');
      assert.throws(() => assertReleaseArtifactContents(root), /Release artifact contains denied paths:/);
    }
    for (const runtimeFile of [
      'claude/.claude-plugin/plugin.json', 'src/mcp/core/project-root-cache.js',
      'src/scripts/read-state.js', 'src/templates/session-state.md',
    ]) assert.equal(isDeniedPath(runtimeFile), false, runtimeFile);
  });

  it('rejects extracted symlinks to files, directories and missing targets', () => {
    const external = makeTempDir('maestro-artifact-link-target-');
    fs.writeFileSync(path.join(external, 'file.md'), 'external fixture\n');
    for (const [target, type] of [[external, 'dir'], [path.join(external, 'file.md'), 'file'], [path.join(external, 'missing'), 'file']]) {
      const root = makeTempDir('maestro-artifact-link-');
      fs.mkdirSync(path.join(root, 'src'));
      fs.symlinkSync(target, path.join(root, 'src/linked'), type);
      assert.throws(() => assertReleaseArtifactContents(root), /Release artifact contains symbolic link: src\/linked/);
    }
  });

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

  it('excludes build sources from archives without denying them in npm packages', () => {
    for (const buildPath of [
      'src/entry-points',
      'src/entry-points/templates/qwen-command.toml.tmpl',
      'src/generator',
      'src/generator/dependency-graph.js',
      'src/transforms',
      'src/transforms/agent-stub.js',
      'src/generator/stub-outputs.js',
      'src/platforms/metadata.js',
      'src/platforms/qwen/policy-pack.js',
      'src/lib/discovery',
      'src/lib/discovery/index.js',
      'src/lib/yaml-emit.js',
    ]) {
      assert.equal(isReleaseArtifactPathAllowed(buildPath), false, buildPath);
      assert.equal(isDeniedPath(buildPath), false, buildPath);
    }
    for (const runtimePath of [
      'src/mcp/maestro-server.js',
      'src/platforms/qwen/runtime-config.js',
      'src/platforms/shared/hook-runner.js',
      'src/scripts/ensure-workspace.js',
      'src/lib/io/index.js',
      'src/templates/session-state.md',
    ]) {
      assert.equal(isReleaseArtifactPathAllowed(runtimePath), true, runtimePath);
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

  it('requires the Qwen MCP configuration to launch its public server', () => {
    for (const server of [
      { command: 'npx', args: ['${extensionPath}/mcp/maestro-server.js'] },
      { command: 'node', args: ['does-not-exist.js'] },
      { command: 'node', args: [] },
    ]) {
      const tempRoot = copyRuntimeManifests();
      editJson(path.join(tempRoot, 'qwen-extension.json'), (manifest) => {
        manifest.mcpServers.maestro = server;
      });
      assert.throws(() => assertRuntimeManifestShape(tempRoot), {
        message: 'qwen-extension.json must launch the bundled Maestro MCP server',
      });
    }
  });

  it('requires all public launchers, server modules, and referenced hook/app files', () => {
    for (const relativePath of [
      'antigravity/hooks/hook-runner.js',
      'antigravity/hooks/policy-enforcer.js',
      'antigravity/hooks.json',
      'antigravity/mcp/maestro-server.js',
      'antigravity/src/mcp/maestro-server.js',
      'bin/maestro-mcp-server.js',
      'claude/hooks/claude-hooks.json',
      'claude/mcp/maestro-server.js',
      'claude/scripts/hook-runner.js',
      'claude/scripts/policy-enforcer.js',
      'claude/src/mcp/maestro-server.js',
      'hooks/hook-runner.js',
      'mcp/maestro-server.js',
      'plugins/maestro/.app.json',
      'plugins/maestro/src/mcp/maestro-server.js',
      'qwen/hooks.json',
      'src/mcp/maestro-server.js',
    ]) {
      const tempRoot = copyRuntimeManifests();
      fs.rmSync(path.join(tempRoot, relativePath));

      assert.throws(
        () => assertRuntimeManifestShape(tempRoot),
        { message: `Required runtime file missing: ${relativePath}` }
      );
    }
  });

  it('rejects directories in place of required runtime files', () => {
    for (const relativePath of ['bin/maestro-mcp-server.js', 'mcp/maestro-server.js', 'plugins/maestro/.app.json']) {
      const tempRoot = copyRuntimeManifests();
      fs.rmSync(path.join(tempRoot, relativePath));
      fs.mkdirSync(path.join(tempRoot, relativePath));
      assert.throws(() => assertRuntimeManifestShape(tempRoot), {
        message: `Required runtime file must be a regular file: ${relativePath}`,
      });
    }
  });
});
