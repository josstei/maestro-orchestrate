import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PACKAGE_BUDGETS,
  PACKAGE_SURFACE_RULES,
  PRIVATE_SCRIPT_ROLES,
  assertNoPackagedRootScripts,
  classifyPackageEntry,
  parsePackJson,
  verifyPackageEntries,
} from '../../dist/src/tooling/verify-npm-pack.js';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
import { REQUIRED_PACKAGE_FILES, RUNTIME_DIST_PATHS } from '../../dist/src/tooling/release-artifact-manifest.js';
import { readFileSync } from 'node:fs';
const REQUIRED_FIXTURE_FILES = [...REQUIRED_PACKAGE_FILES];

const BUILD_ONLY_SOURCE_PATHS = [
  'src/generator/file-writer.ts',
  'src/transforms/index.ts',
  'src/entry-points/registry.js',
  'src/lib/discovery/index.ts',
  'src/lib/yaml-emit.ts',
  'src/manifest.js',
  'src/platforms/metadata.ts',
  'src/platforms/metadata-shared.ts',
  'src/platforms/claude/metadata.ts',
  'src/platforms/runtime-payload-contract.ts',
];

const sourcePathToDistPath = (sourcePath) =>
  `dist/${sourcePath.endsWith('.ts') ? sourcePath.slice(0, -3) + '.js' : sourcePath}`;

const BUILD_ONLY_DIST_PATHS = BUILD_ONLY_SOURCE_PATHS.map(sourcePathToDistPath);
const removedRuntimePath = (...parts) => parts.join('/');
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    assert.deepEqual(classifyPackageEntry('bin/maestro-install-codex.js'), []);
    assert.deepEqual(classifyPackageEntry('bin/maestro-mcp-server.js'), []);
    assert.deepEqual(classifyPackageEntry('dist/src/bin/maestro-install-codex.js'), ['public-bin', 'runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/bin/maestro-mcp-server.js'), ['public-bin', 'runtime-dist']);
  });

  it('does not classify package-root source as package runtime content', () => {
    assert.equal(PACKAGE_SURFACE_RULES.some((rule) => rule.id === 'canonical-source'), false);
    assert.equal(PACKAGE_SURFACE_RULES.some((rule) => rule.id === 'runtime-source'), false);

    for (const sourcePath of [
      'src/mcp/maestro-server.ts',
      'src/platforms/claude/runtime-config.ts',
      'src/lib/framework-detection.ts',
    ]) {
      assert.deepEqual(classifyPackageEntry(sourcePath), []);
      assert.throws(
        () => verifyPackageEntries(packageFiles([sourcePath])),
        new RegExp(`npm package contains forbidden path: ${escaped(sourcePath)}`)
      );
    }
  });

  it('classifies final dist runtime only through the explicit runtime-dist inventory', () => {
    assert.deepEqual(classifyPackageEntry('dist/src/bin/maestro-install-codex.js'), ['public-bin', 'runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/bin/maestro-mcp-server.js'), ['public-bin', 'runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/mcp/maestro-server.js'), ['runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/platforms/claude/runtime-config.js'), ['runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/generated/runtime-content-registry.json'), ['runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/generated/runtime-content-registry.txt'), ['runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/generator/file-writer.js'), []);
  });

  it('does not classify raw dist content directories as package runtime content', () => {
    for (const rawContentPath of [
      'dist/src/agents/coder.md',
      'dist/src/references/architecture.md',
      'dist/src/skills/shared/delegation/SKILL.md',
      'dist/src/templates/session-state.md',
    ]) {
      assert.deepEqual(classifyPackageEntry(rawContentPath), []);
      assert.throws(
        () => verifyPackageEntries(packageFiles([rawContentPath])),
        new RegExp(`npm package contains unclassified paths: ${escaped(rawContentPath)}`)
      );
    }
  });

  it('keeps package.json free of private package roots', () => {
    const normalizePackagePath = (filePath) => filePath.replace(/\/+$/, '');
    const privateRootPaths = packageJson.files
      .map(normalizePackagePath)
      .filter((filePath) =>
        filePath === 'src' ||
        filePath.startsWith('src/') ||
        filePath === 'scripts' ||
        filePath.startsWith('scripts/') ||
        filePath === 'bin' ||
        filePath.startsWith('bin/')
      )
      .sort();

    assert.deepEqual(privateRootPaths, []);
  });

  it('keeps package.json dist runtime entries aligned with the shared final inventory', () => {
    const normalizePackagePath = (filePath) => filePath.replace(/\/+$/, '');
    const packageRuntimeDistPaths = packageJson.files
      .map(normalizePackagePath)
      .filter((filePath) => filePath === 'dist' || filePath.startsWith('dist/'))
      .sort();

    assert.equal(packageRuntimeDistPaths.includes('dist'), false);
    assert.deepEqual(packageRuntimeDistPaths, [...RUNTIME_DIST_PATHS].sort());
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
        new RegExp(`npm package contains forbidden path: ${escaped(removedScript)}`)
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
      new RegExp(`npm package contains forbidden path: ${escaped(removedPath)}`)
    );
  });

  it('rejects package-root source checkout tooling as forbidden package content', () => {
    for (const buildOnlyPath of BUILD_ONLY_SOURCE_PATHS) {
      assert.deepEqual(classifyPackageEntry(buildOnlyPath), []);
      assert.throws(
        () => verifyPackageEntries(packageFiles([buildOnlyPath])),
        new RegExp(`npm package contains forbidden path: ${escaped(buildOnlyPath)}`)
      );
    }
  });

  it('rejects build-only dist checkout tooling as forbidden package content', () => {
    for (const buildOnlyPath of BUILD_ONLY_DIST_PATHS) {
      assert.deepEqual(classifyPackageEntry(buildOnlyPath), []);
      assert.throws(
        () => verifyPackageEntries(packageFiles([buildOnlyPath])),
        new RegExp(`npm package contains forbidden path: ${escaped(buildOnlyPath)}`)
      );
    }
  });

  it('rejects declaration files and source maps inside otherwise allowlisted dist runtime roots', () => {
    for (const privateDistPath of [
      'dist/src/bin/maestro-mcp-server.d.ts',
      'dist/src/mcp/maestro-server.d.ts',
      'dist/src/mcp/maestro-server.js.map',
    ]) {
      assert.throws(
        () => verifyPackageEntries(packageFiles([privateDistPath])),
        new RegExp(`npm package contains forbidden path: ${escaped(privateDistPath)}`)
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

  it('rejects any packaged root bins as private source-checkout content', () => {
    assert.throws(
      () => verifyPackageEntries(packageFiles(['bin/maestro-mcp-server.js'])),
      /npm package contains forbidden path: bin\/maestro-mcp-server\.js/
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
