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
  withTempDir,
} = require('../../scripts/release-artifact-manifest');
const { editJson, makeTempDir, readJson, writeTree } = require('../support/fs');
const { ROOT } = require('../support/paths');

// The public launchers, server modules and referenced hook/app files the shape check requires.
const REQUIRED_RUNTIME_FILES = [
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
];

// Every file assertRuntimeManifestShape reads or requires.
const RUNTIME_MANIFEST_FILES = [
  ...REQUIRED_RUNTIME_FILES,
  '.agents/plugins/marketplace.json',
  '.claude-plugin/marketplace.json',
  'antigravity/mcp_config.json',
  'antigravity/plugin.json',
  'antigravity/src/version.json',
  'claude/.claude-plugin/plugin.json',
  'claude/.mcp.json',
  'claude/src/version.json',
  'package.json',
  'plugins/maestro/.codex-plugin/plugin.json',
  'plugins/maestro/.mcp.json',
  'plugins/maestro/src/version.json',
  'qwen-extension.json',
];

const PKG_VERSION = readJson(path.join(ROOT, 'package.json')).version;
const UNALLOWLISTED_FILE = 'unexpected-local-file.txt';
const NESTED_DEV_PATHS = [
  'claude/tests/fixtures/helper.js', 'antigravity/.cache/probe.json',
  'src/tmp/probe.txt', 'plugins/maestro/node_modules/acorn/index.js',
  'src/scratch/notes.md', 'src/coverage/report.html', 'src/.git/config',
];

function copyRuntimeManifests() {
  const tempRoot = makeTempDir('maestro-release-runtime-');
  for (const relativePath of RUNTIME_MANIFEST_FILES) {
    fs.mkdirSync(path.dirname(path.join(tempRoot, relativePath)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relativePath), path.join(tempRoot, relativePath));
  }
  return tempRoot;
}

/** Asserts that `check` throws `expected` for the root a fresh `setup()` call prepares. */
function rejects(check, setup, expected) {
  const root = setup();
  assert.throws(() => check(root), expected);
}

describe('release artifact manifest', () => {
  // [path, isReleaseArtifactPathAllowed, isDeniedPath]; null skips that check.
  for (const [relativePath, allowed, denied] of [
    // Nested development, test, cache and scratch paths are denied without matching runtime names.
    ...[...NESTED_DEV_PATHS, '.gemini/settings.json', '.gemini_security/settings.json'].map((p) => [p, null, true]),
    ...['claude/.claude-plugin/plugin.json', 'src/mcp/core/project-root-cache.js'].map((p) => [p, null, false]),
    // Repo-root agents/ holds the Qwen agent stubs (Qwen loads <extension>/agents/).
    ...[
      'agents/coder.md',
      'antigravity/agents/coder.md',
      'antigravity/src/mcp/maestro-server.js',
    ].map((p) => [p, true, null]),
    // No Gemini CLI surfaces ship.
    ...[
      'gemini-extension.json',
      'GEMINI.md',
      '.geminiignore',
      'docs/runtime-gemini.md',
    ].map((p) => [p, false, null]),
    // Build sources are excluded from archives without being listed as denied paths.
    ...[
      'src/entry-points',
      'src/entry-points/templates/qwen-command.toml.tmpl',
      'src/generator',
      'src/generator/dependency-graph.js',
      'src/generator/stub-outputs.js',
      'src/platforms/metadata.js',
      'src/platforms/qwen/policy-pack.js',
      'src/lib/discovery',
      'src/lib/discovery/index.js',
    ].map((p) => [p, false, false]),
    ...[
      'src/mcp/maestro-server.js',
      'src/platforms/qwen/runtime-config.js',
      'src/platforms/shared/hook-runner.js',
      'src/scripts/ensure-workspace.js',
      'src/scripts/read-state.js',
      'src/lib/io/index.js',
      'src/templates/session-state.md',
    ].map((p) => [p, true, false]),
    // Test-only files inside otherwise allowlisted runtime roots are denied.
    ['claude/scripts/policy-enforcer.test.js', true, true],
    // Parent directories needed to reach explicitly allowlisted files are allowed.
    ['docs', true, null],
    ['.agents/plugins', true, null],
    [UNALLOWLISTED_FILE, false, null],
  ]) {
    it(`classifies ${relativePath}`, () => {
      if (allowed !== null) assert.equal(isReleaseArtifactPathAllowed(relativePath), allowed, 'allowlisted');
      if (denied !== null) assert.equal(isDeniedPath(relativePath), denied, 'denied');
    });
  }

  it('lists every required release surface and keeps the allowlist and denylist apart', () => {
    const requiredSurfaces = [
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
    assert.deepEqual(requiredSurfaces.filter((entry) => !RELEASE_ARTIFACT_PATHS.includes(entry)), []);
    assert.deepEqual(RELEASE_ARTIFACT_PATHS.filter((entry) => /gemini/i.test(entry) || isDeniedPath(entry)), []);
    for (const entry of ['.gemini', '.gemini_security']) assert.ok(DENIED_ARTIFACT_PATHS.includes(entry), entry);
    for (const deniedPath of DENIED_ARTIFACT_PATHS) {
      assert.equal(isDeniedPath(deniedPath), true, deniedPath);
      assert.equal(isDeniedPath(`${deniedPath}/nested.txt`), true, `${deniedPath}/nested.txt`);
    }
  });

  const artifactRoot = (files) => () => {
    const root = makeTempDir('maestro-artifact-');
    for (const [relativePath, content] of Object.entries(files)) writeTree(root, relativePath, content);
    return root;
  };
  const linkedRoot = (target, type) => () => {
    const root = makeTempDir('maestro-artifact-link-');
    fs.mkdirSync(path.join(root, 'src'));
    fs.symlinkSync(target, path.join(root, 'src/linked'), type);
    return root;
  };
  const external = makeTempDir('maestro-artifact-link-target-');
  const externalFile = writeTree(external, 'file.md', 'external fixture\n');
  for (const [name, setup, expected] of [
    ...NESTED_DEV_PATHS.map((file) =>
      [`a nested ${file}`, artifactRoot({ [file]: 'fixture\n' }), /Release artifact contains denied paths:/]),
    ['a denied test file', artifactRoot({ 'claude/scripts/policy-enforcer.test.js': 'test\n' }),
      /Release artifact contains denied paths: claude\/scripts\/policy-enforcer\.test\.js/],
    ['a file outside the allowlist', artifactRoot({ [UNALLOWLISTED_FILE]: 'secret\n' }),
      /Release artifact contains unallowlisted paths: unexpected-local-file\.txt/],
    ...[
      ['a directory symlink', external, 'dir'],
      ['a file symlink', externalFile, 'file'],
      ['a dangling symlink', path.join(external, 'missing'), 'file'],
    ].map(([kind, target, type]) =>
      [kind, linkedRoot(target, type), /Release artifact contains symbolic link: src\/linked/]),
  ]) {
    it(`rejects extracted contents with ${name}`, () => rejects(assertReleaseArtifactContents, setup, expected));
  }

  it('fails clearly when a required artifact path is missing', () => {
    rejects(assertRequiredArtifactPaths, artifactRoot({}), /Required release artifact paths are missing:/);
    const allButDoc = RELEASE_ARTIFACT_PATHS.filter((entry) => entry !== 'docs/runtime-antigravity.md');
    rejects(assertRequiredArtifactPaths, artifactRoot(Object.fromEntries(allButDoc.map((entry) => [entry, '']))),
      { message: 'Required release artifact paths are missing: docs/runtime-antigravity.md' });
  });

  it('keeps all runtime manifest versions aligned with package.json', () => {
    assert.equal(assertRuntimeManifestShape(ROOT), PKG_VERSION);
    assert.equal(assertRuntimeManifestShape(copyRuntimeManifests()), PKG_VERSION);
  });

  const edited = (file, edit) => () => {
    const root = copyRuntimeManifests();
    editJson(path.join(root, file), edit);
    return root;
  };
  const replaced = (file, replace) => () => {
    const root = copyRuntimeManifests();
    fs.rmSync(path.join(root, file));
    replace(path.join(root, file));
    return root;
  };
  const ANTIGRAVITY_CONFIG = 'antigravity/mcp_config.json';
  const ANTIGRAVITY_LAUNCH = `${ANTIGRAVITY_CONFIG} must launch the bundled Maestro MCP server`;
  for (const [name, setup, message] of [
    ...['antigravity/plugin.json', 'antigravity/src/version.json'].map((file) => [`a drifted ${file} version`,
      edited(file, (content) => { content.version = '0.0.0'; }),
      `Release manifest version mismatch; expected ${PKG_VERSION}: ${file}=0.0.0`]),
    ['a misnamed antigravity plugin',
      edited('antigravity/plugin.json', (manifest) => { manifest.name = 'maestro-orchestrate'; }),
      'antigravity/plugin.json must name the plugin maestro'],
    ['no antigravity maestro server',
      edited(ANTIGRAVITY_CONFIG, (config) => { delete config.mcpServers.maestro; }), ANTIGRAVITY_LAUNCH],
    ['an npx antigravity server',
      edited(ANTIGRAVITY_CONFIG, (config) => { config.mcpServers.maestro.command = 'npx'; }), ANTIGRAVITY_LAUNCH],
    ['an antigravity server outside the launcher', edited(ANTIGRAVITY_CONFIG, (config) => {
      config.mcpServers.maestro.args = ['${PLUGIN_ROOT}/src/mcp/maestro-server.js'];
    }), ANTIGRAVITY_LAUNCH],
    ...[
      { command: 'npx', args: ['${extensionPath}/mcp/maestro-server.js'] },
      { command: 'node', args: ['does-not-exist.js'] },
      { command: 'node', args: [] },
    ].map((server) => [`a Qwen server ${JSON.stringify(server)}`,
      edited('qwen-extension.json', (manifest) => { manifest.mcpServers.maestro = server; }),
      'qwen-extension.json must launch the bundled Maestro MCP server']),
    ...REQUIRED_RUNTIME_FILES.map((file) =>
      [`a missing ${file}`, replaced(file, () => {}), `Required runtime file missing: ${file}`]),
    ...['bin/maestro-mcp-server.js', 'mcp/maestro-server.js', 'plugins/maestro/.app.json'].map((file) => [
      `a directory at ${file}`, replaced(file, fs.mkdirSync), `Required runtime file must be a regular file: ${file}`,
    ]),
  ]) {
    it(`rejects runtime manifests with ${name}`, () => rejects(assertRuntimeManifestShape, setup, { message }));
  }

  it('runs scripts in a scratch directory that is removed on success and on failure', () => {
    let directory;
    const result = withTempDir('maestro-script-test-', (scratch) => {
      directory = scratch;
      writeTree(scratch, 'nested/artifact', 'content');
      return { verified: true };
    });
    assert.deepEqual(result, { verified: true });
    assert.equal(fs.existsSync(directory), false);

    const failure = new Error('artifact invalid');
    assert.throws(() => withTempDir('maestro-script-test-', (scratch) => {
      directory = scratch;
      writeTree(scratch, 'partial', 'incomplete');
      throw failure;
    }), (error) => error === failure);
    assert.equal(fs.existsSync(directory), false);
  });
});
