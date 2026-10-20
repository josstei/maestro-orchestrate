'use strict';

const { beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildDetachedPayload } = require('../../src/generator/payload-builder');
const { globFiles } = require('../../src/generator/glob-files');
const { RUNTIME_NAMES } = require('../../src/platforms/runtime-config-map');
const { makeTempDir, readJson, writeJson, writeTree } = require('../support/fs');

const outputsOf = (runtimeName) => require(`../../src/platforms/${runtimeName}/outputs`);

/** One file under every src/ prefix every payload ships. */
const BASE_FILES = [
  'agents/coder.md',
  'config/settings-catalog.js',
  'core/logger.js',
  'generated/hook-registry.json',
  'lib/io.js',
  'mcp/maestro-server.js',
  'platforms/runtime-config-map.js',
  'references/architecture.md',
  'skills/shared/delegation/SKILL.md',
  'state/session-state.js',
  'templates/session-state.md',
];

/** One file under every src/ prefix some runtime ships beyond the base. */
const EXTRA_FILES = [
  'hooks/logic/session-start-logic.js',
  'platforms/shared/hook-runner.js',
  'scripts/read-state.js',
];

/** Each runtime's platform modules plus the build-time files beside them. */
const PLATFORM_FILES = RUNTIME_NAMES.flatMap((runtimeName) => [
  'hook-adapter.js',
  'outputs.js',
  'policy-enforcer.js',
  'runtime-config.js',
  'templates/entry-point.md.tmpl',
].map((file) => `platforms/${runtimeName}/${file}`));

/** Build-time sources no payload ships. */
const BUILD_ONLY_FILES = [
  'entry-points/registry.js',
  'generator/manifest.js',
  'platforms/qwen/policy-pack.js',
];

const platformModules = (runtimeName) => ['hook-adapter.js', 'policy-enforcer.js', 'runtime-config.js']
  .map((file) => `platforms/${runtimeName}/${file}`);

describe('detached payload contents', () => {
  it('ships the base, the runtime platform modules and the runtime extras for each payload runtime', () => {
    const srcDir = makeTempDir('maestro-payload-src-');
    for (const file of [...BASE_FILES, ...EXTRA_FILES, ...PLATFORM_FILES, ...BUILD_ONLY_FILES]) {
      writeTree(srcDir, file, file);
    }
    const expected = {
      // Antigravity runs its hooks and the served script-based state contract
      // from the installed plugin.
      antigravity: [...BASE_FILES, ...EXTRA_FILES, ...platformModules('antigravity')],
      claude: [...BASE_FILES, ...EXTRA_FILES.filter((file) => !file.startsWith('scripts/')), ...platformModules('claude')],
      // Codex registers no hooks.
      codex: [...BASE_FILES, ...platformModules('codex')],
    };

    assert.deepEqual(
      RUNTIME_NAMES.filter((runtimeName) => outputsOf(runtimeName).payload !== null),
      Object.keys(expected)
    );
    for (const [runtimeName, files] of Object.entries(expected)) {
      const outputDir = makeTempDir(`maestro-payload-${runtimeName}-`);
      buildDetachedPayload(srcDir, outputDir, runtimeName, outputsOf(runtimeName).payload, '1.0.0');
      assert.deepEqual(globFiles(outputDir, '**/*'), [...files, 'version.json'].sort(), runtimeName);
    }
  });
});

describe('buildDetachedPayload', () => {
  let srcDir;
  let outputDir;

  beforeEach(() => {
    srcDir = makeTempDir('maestro-payload-src-');
    outputDir = makeTempDir('maestro-payload-out-');
  });

  it('removes stale files from the output directory', () => {
    writeTree(srcDir, 'core/logger.js', 'kept');
    writeTree(outputDir, 'core/old-file.js', 'stale');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', [], '1.0.0');

    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'logger.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'core', 'old-file.js')));
    assert.equal(stats.removed, 1);
  });

  it('does not rewrite files when content is unchanged', () => {
    writeTree(srcDir, 'core/logger.js', 'same content');
    writeTree(outputDir, 'core/logger.js', 'same content');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', [], '1.0.0');

    assert.equal(stats.copied, 0);
  });

  it('stamps version.json without counting it as copied or pruning it', () => {
    writeTree(srcDir, 'core/logger.js', 'content');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', [], '4.0.0');

    assert.equal(
      fs.readFileSync(path.join(outputDir, 'version.json'), 'utf8'),
      JSON.stringify({ version: '4.0.0' }, null, 2) + '\n'
    );
    assert.deepEqual(stats, { copied: 1, removed: 0 });
  });

  it('does not rewrite version.json when the version is unchanged', () => {
    writeTree(srcDir, 'core/logger.js', 'content');
    writeJson(path.join(outputDir, 'version.json'), { version: '1.5.0' });
    const mtimeBefore = fs.statSync(path.join(outputDir, 'version.json')).mtimeMs;

    buildDetachedPayload(srcDir, outputDir, 'claude', [], '1.5.0');

    assert.equal(fs.statSync(path.join(outputDir, 'version.json')).mtimeMs, mtimeBefore);
  });

  it('overwrites version.json when the version differs', () => {
    writeTree(srcDir, 'core/logger.js', 'content');
    writeJson(path.join(outputDir, 'version.json'), { version: '1.0.0' });

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', [], '2.0.0');

    const content = readJson(path.join(outputDir, 'version.json'));
    assert.deepEqual(content, { version: '2.0.0' });
    assert.equal(stats.removed, 0);
  });

  it('cleans up empty directories after stale file removal', () => {
    writeTree(srcDir, 'core/logger.js', 'content');
    writeTree(outputDir, 'orphaned-dir/stale.js', 'stale');

    buildDetachedPayload(srcDir, outputDir, 'claude', [], '1.0.0');

    assert.ok(!fs.existsSync(path.join(outputDir, 'orphaned-dir')));
  });
});
