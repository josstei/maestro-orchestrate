import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INVENTORY, RUNTIME_DIST_PATHS, npmFiles, releasePaths } from '../../dist/src/tooling/lib/artifact-inventory.js';
import {
  RAW_DIST_CONTENT_ROOTS,
  RELEASE_ONLY_PACKAGE_DOCS,
  VALID_ARTIFACT_SCOPES,
  packageJson,
} from '../support/contracts.js';

describe('artifact inventory', () => {
  it('package.json files exactly equals the npm projection', () => {
    const pkg = packageJson;
    assert.deepEqual([...pkg.files].sort(), npmFiles());
  });

  it('every inventory path has a valid scope', () => {
    for (const entry of INVENTORY) {
      assert.ok(VALID_ARTIFACT_SCOPES.has(entry.scope), `${entry.path} has invalid scope ${entry.scope}`);
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

  it('keeps long-form package docs release-only and out of npm', () => {
    for (const docPath of RELEASE_ONLY_PACKAGE_DOCS) {
      const entry = INVENTORY.find((candidate) => candidate.path === docPath);
      assert.ok(entry, `expected inventory entry for ${docPath}`);
      assert.equal(entry.scope, 'release');
      assert.equal(npmFiles().includes(docPath), false);
      assert.ok(releasePaths().includes(docPath));
    }
  });

  it('does not project package-root source paths into package or release artifacts', () => {
    for (const projectedPath of [...npmFiles(), ...releasePaths()]) {
      assert.equal(projectedPath === 'src' || projectedPath.startsWith('src/'), false, projectedPath);
    }
  });

  it('exposes the final runtime dist path subset used by release and package tooling', () => {
    assert.ok(Array.isArray(RUNTIME_DIST_PATHS));
    assert.ok(Object.isFrozen(RUNTIME_DIST_PATHS));
    assert.ok(RUNTIME_DIST_PATHS.includes('dist/src/bin/maestro-mcp-server.js'));
    assert.ok(RUNTIME_DIST_PATHS.includes('dist/src/mcp'));
    assert.ok(RUNTIME_DIST_PATHS.includes('dist/src/generated'));

    for (const rawContentRoot of RAW_DIST_CONTENT_ROOTS) {
      assert.equal(RUNTIME_DIST_PATHS.includes(rawContentRoot), false);
    }

    for (const runtimeDistPath of RUNTIME_DIST_PATHS) {
      assert.ok(npmFiles().includes(runtimeDistPath));
      assert.ok(releasePaths().includes(runtimeDistPath));
    }
  });

  it('freezes the inventory and its entries', () => {
    assert.ok(Object.isFrozen(INVENTORY));
    for (const entry of INVENTORY) {
      assert.ok(Object.isFrozen(entry));
    }
  });
});
