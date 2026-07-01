'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  PACKAGE_BUDGETS,
  PACKAGE_SURFACE_RULES,
  PRIVATE_SCRIPT_ROLES,
  assertNoPackagedRootScripts,
  classifyPackageEntry,
  parsePackJson,
  verifyPackageEntries,
} = require('../../scripts/verify-npm-pack');
const packageJson = require('../../package.json');
const {
  REQUIRED_PACKAGE_FILES,
  RUNTIME_SOURCE_PATHS,
} = require('../../scripts/release-artifact-manifest');

const REQUIRED_FIXTURE_FILES = [...REQUIRED_PACKAGE_FILES];
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
const removedRuntimePath = (...parts) => parts.join('/');

function packageFiles(extraFiles = [], packageFields = {}) {
  return [{
    filename: 'pkg.tgz',
    size: 1,
    unpackedSize: 1,
    files: [...new Set([
      ...REQUIRED_FIXTURE_FILES,
      ...extraFiles,
    ])].map((filePath) => ({ path: filePath })),
    ...packageFields,
  }];
}

describe('verify npm pack', () => {
  it('parses npm pack JSON after lifecycle output', () => {
    const parsed = parsePackJson('> prepack\nGeneration complete\n[{"filename":"pkg.tgz","files":[]}]\n');

    assert.equal(parsed[0].filename, 'pkg.tgz');
  });

  it('requires release-critical files in the package', () => {
    assert.doesNotThrow(() => verifyPackageEntries(packageFiles()));
  });

  it('requires every runtime package invariant in the package', () => {
    for (const requiredPath of REQUIRED_PACKAGE_FILES) {
      const [packageInfo] = packageFiles();
      packageInfo.files = packageInfo.files.filter((file) => file.path !== requiredPath);

      assert.throws(
        () => verifyPackageEntries([packageInfo]),
        new RegExp(`npm package missing required file: ${requiredPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
  });

  it('rejects test-only package content', () => {
    assert.throws(
      () => verifyPackageEntries(packageFiles(['tests/unit/example.test.js'])),
      /npm package contains forbidden path: tests\/unit\/example\.test\.js/
    );
  });

  it('rejects nested test-only files inside runtime package roots', () => {
    for (const forbiddenPath of [
      'claude/scripts/policy-enforcer.test.js',
      'plugins/maestro/skills/server.spec.js',
      'claude/scripts/__tests__/fixture.js',
    ]) {
      assert.throws(
        () => verifyPackageEntries(packageFiles([forbiddenPath])),
        new RegExp(`npm package contains forbidden path: ${forbiddenPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
  });

  it('rejects unclassified package paths even when they are not denied', () => {
    assert.throws(
      () => verifyPackageEntries(packageFiles(['unexpected-runtime/file.txt'])),
      /npm package contains unclassified paths: unexpected-runtime\/file\.txt/
    );
  });

  it('rejects retired detached payload files', () => {
    for (const payloadPath of [
      'claude/src/mcp/maestro-server.js',
      'claude/src/version.json',
      'plugins/maestro/src/mcp/maestro-server.js',
      'plugins/maestro/src/version.json',
    ]) {
      assert.throws(
        () => verifyPackageEntries(packageFiles([payloadPath])),
        new RegExp(`npm package contains forbidden path: ${payloadPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
  });

  it('classifies both public bins as the package command surface', () => {
    assert.deepEqual(classifyPackageEntry('bin/maestro-install-codex.js'), ['public-bin']);
    assert.deepEqual(classifyPackageEntry('bin/maestro-mcp-server.js'), ['public-bin']);
  });

  it('classifies runtime source only through the explicit runtime-source inventory', () => {
    assert.equal(PACKAGE_SURFACE_RULES.some((rule) => rule.id === 'canonical-source'), false);
    assert.deepEqual(classifyPackageEntry('src/mcp/maestro-server.js'), ['runtime-source']);
    assert.deepEqual(classifyPackageEntry('src/platforms/claude/runtime-config.js'), ['runtime-source']);
  });

  it('keeps package.json runtime source entries aligned with the shared inventory', () => {
    const normalizePackagePath = (filePath) => filePath.replace(/\/+$/, '');
    const packageRuntimeSourcePaths = packageJson.files
      .map(normalizePackagePath)
      .filter((filePath) => filePath === 'src' || filePath.startsWith('src/'))
      .sort();

    assert.equal(packageRuntimeSourcePaths.includes('src'), false);
    assert.deepEqual(packageRuntimeSourcePaths, [...RUNTIME_SOURCE_PATHS].sort());
  });

  it('does not classify removed state helper scripts as package runtime source', () => {
    for (const removedScript of [
      removedRuntimePath('src', 'scripts', ['ensure', 'workspace'].join('-') + '.js'),
      removedRuntimePath('src', 'scripts', ['read', 'active', 'session'].join('-') + '.js'),
      removedRuntimePath('src', 'scripts', ['read', 'state'].join('-') + '.js'),
      removedRuntimePath('src', 'scripts', ['write', 'state'].join('-') + '.js'),
      removedRuntimePath('src', 'scripts', ['read', 'setting'].join('-') + '.js'),
    ]) {
      assert.deepEqual(classifyPackageEntry(removedScript), []);
      assert.throws(
        () => verifyPackageEntries(packageFiles([removedScript])),
        new RegExp(`npm package contains unclassified paths: ${removedScript.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
  });

  it('does not classify removed shared agent names module as package runtime source', () => {
    const removedPath = removedRuntimePath(
      'src',
      'platforms',
      'shared',
      ['agent', 'names'].join('-') + '.js'
    );
    assert.deepEqual(classifyPackageEntry(removedPath), []);
    assert.throws(
      () => verifyPackageEntries(packageFiles([removedPath])),
      new RegExp(`npm package contains unclassified paths: ${removedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    );
  });

  it('rejects build-only source checkout tooling as unclassified package content', () => {
    for (const buildOnlyPath of BUILD_ONLY_SOURCE_PATHS) {
      assert.deepEqual(classifyPackageEntry(buildOnlyPath), []);
      assert.throws(
        () => verifyPackageEntries(packageFiles([buildOnlyPath])),
        new RegExp(`npm package contains unclassified paths: ${buildOnlyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
  });

  it('keeps private source-checkout scripts documented but unpublished', () => {
    const scriptPaths = Object.keys(PRIVATE_SCRIPT_ROLES);
    const validRoles = new Set(['release-only', 'dev-only']);

    for (const scriptPath of scriptPaths) {
      assert.deepEqual(classifyPackageEntry(scriptPath), []);
      assert.ok(validRoles.has(PRIVATE_SCRIPT_ROLES[scriptPath].role));
    }

    assert.doesNotThrow(() => assertNoPackagedRootScripts([]));
  });

  it('rejects any packaged root scripts as private source-checkout content', () => {
    assert.throws(
      () => verifyPackageEntries(packageFiles(['scripts/generate.js'])),
      /npm package contains private root scripts: scripts\/generate\.js/
    );

    assert.throws(
      () => verifyPackageEntries(packageFiles(['scripts/new-helper.js'])),
      /npm package contains private root scripts: scripts\/new-helper\.js/
    );
  });

  it('enforces package entry and size budgets', () => {
    assert.throws(
      () => verifyPackageEntries(packageFiles([], {
        size: PACKAGE_BUDGETS.maxPackedSize + 1,
        unpackedSize: PACKAGE_BUDGETS.maxUnpackedSize + 1,
      })),
      /npm package exceeds budgets: packedSize/
    );
  });

  it('requires npm pack size metadata before enforcing budgets', () => {
    const [packageInfo] = packageFiles();
    delete packageInfo.size;
    delete packageInfo.unpackedSize;

    assert.throws(
      () => verifyPackageEntries([packageInfo]),
      /npm package exceeds budgets: packedSize metadata missing, unpackedSize metadata missing/
    );
  });
});
