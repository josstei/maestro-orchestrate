'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  INVENTORY,
  RUNTIME_SOURCE_PATHS,
  npmFiles,
  releasePaths,
} = require('../../scripts/lib/artifact-inventory');

const VALID_SCOPES = new Set(['both', 'npm', 'release']);

describe('artifact inventory', () => {
  it('package.json files exactly equals the npm projection', () => {
    const pkg = require('../../package.json');
    assert.deepEqual([...pkg.files].sort(), npmFiles());
  });

  it('every inventory path has a valid scope', () => {
    for (const entry of INVENTORY) {
      assert.ok(VALID_SCOPES.has(entry.scope), `${entry.path} has invalid scope ${entry.scope}`);
    }
  });

  it('inventory paths are unique', () => {
    const paths = INVENTORY.map((entry) => entry.path);
    assert.deepEqual(paths, [...new Set(paths)]);
  });

  it('npmFiles and releasePaths are sorted with no duplicates', () => {
    const npm = npmFiles();
    const release = releasePaths();

    assert.deepEqual(npm, [...npm].sort());
    assert.deepEqual(release, [...release].sort());
    assert.deepEqual(npm, [...new Set(npm)]);
    assert.deepEqual(release, [...new Set(release)]);
  });

  it('the 5 previously npm-only docs are tagged both and ship in both projections', () => {
    const formerlyNpmOnlyDocs = [
      'docs/architecture.md',
      'docs/cicd.md',
      'docs/flow.md',
      'docs/maestro-cheatsheet.md',
      'docs/overview.md',
    ];

    for (const docPath of formerlyNpmOnlyDocs) {
      const entry = INVENTORY.find((candidate) => candidate.path === docPath);
      assert.ok(entry, `expected inventory entry for ${docPath}`);
      assert.equal(entry.scope, 'both');
      assert.ok(npmFiles().includes(docPath));
      assert.ok(releasePaths().includes(docPath));
    }
  });

  it('exposes the runtime source path subset used by release and package tooling', () => {
    assert.ok(Array.isArray(RUNTIME_SOURCE_PATHS));
    assert.ok(Object.isFrozen(RUNTIME_SOURCE_PATHS));

    for (const runtimeSourcePath of RUNTIME_SOURCE_PATHS) {
      assert.ok(npmFiles().includes(runtimeSourcePath));
      assert.ok(releasePaths().includes(runtimeSourcePath));
    }
  });

  it('freezes the inventory and its entries', () => {
    assert.ok(Object.isFrozen(INVENTORY));
    for (const entry of INVENTORY) {
      assert.ok(Object.isFrozen(entry));
    }
  });
});
