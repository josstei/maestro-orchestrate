import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ARTIFACT_INVENTORY,
  DENIED_ARTIFACT_PATHS,
  DENIED_ARTIFACT_PATTERNS,
  COMPATIBILITY_PACKAGE_FILES,
  PACKAGE_BUDGET,
  PACKAGE_SURFACE_RULES,
  PRIVATE_SCRIPT_ROLES,
  REQUIRED_PACKAGE_FILES,
  RUNTIME_DIST_PATHS,
  RUNTIME_PACKAGE_INVARIANTS,
  npmFiles,
  releasePaths,
} from '../../dist/src/tooling/artifact-policy.js';

import { RUNTIME_PAYLOAD_CONTRACT } from '../../dist/src/tooling/runtime-payload-contract.js';
import {
  EXPECTED_REQUIRED_PACKAGE_FILES,
  RAW_DIST_CONTENT_ROOTS,
  RELEASE_ONLY_PACKAGE_DOCS,
  VALID_ARTIFACT_SCOPES,
} from '../support/contracts.js';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));

function isCoveredByReleaseProjection(artifactPath) {
  return releasePaths().some((allowedPath) => (
    artifactPath === allowedPath ||
    artifactPath.startsWith(`${allowedPath}/`) ||
    allowedPath.startsWith(`${artifactPath}/`)
  ));
}

describe('artifact policy', () => {
  it('owns the npm file projection used by package.json', () => {
    assert.deepEqual([...packageJson.files].sort(), npmFiles());
  });

  it('exposes valid, frozen artifact inventory entries', () => {
    const paths = ARTIFACT_INVENTORY.map((entry) => entry.path);

    assert.ok(Object.isFrozen(ARTIFACT_INVENTORY));
    assert.deepEqual(paths, [...new Set(paths)]);

    for (const entry of ARTIFACT_INVENTORY) {
      assert.ok(Object.isFrozen(entry));
      assert.ok(VALID_ARTIFACT_SCOPES.has(entry.scope), `${entry.path} has invalid scope ${entry.scope}`);
    }
  });

  it('keeps release and npm projections sorted and source-free', () => {
    for (const projection of [npmFiles(), releasePaths()]) {
      assert.deepEqual(projection, [...projection].sort());
      assert.deepEqual(projection, [...new Set(projection)]);
      assert.equal(projection.some((entry) => entry === 'src' || entry.startsWith('src/')), false);
    }
  });

  it('keeps long-form package docs release-only and out of npm', () => {
    for (const docPath of RELEASE_ONLY_PACKAGE_DOCS) {
      const entry = ARTIFACT_INVENTORY.find((candidate) => candidate.path === docPath);
      assert.ok(entry, `expected inventory entry for ${docPath}`);
      assert.equal(entry.scope, 'release');
      assert.equal(npmFiles().includes(docPath), false);
      assert.ok(releasePaths().includes(docPath));
    }
  });

  it('owns runtime package invariants consumed by the payload contract', () => {
    const policyInvariants = [...new Set(Object.values(RUNTIME_PACKAGE_INVARIANTS).flat())].sort();

    assert.deepEqual(
      REQUIRED_PACKAGE_FILES,
      [...new Set([...policyInvariants, ...COMPATIBILITY_PACKAGE_FILES])].sort()
    );
    assert.deepEqual(REQUIRED_PACKAGE_FILES, EXPECTED_REQUIRED_PACKAGE_FILES);

    for (const runtime of RUNTIME_PAYLOAD_CONTRACT) {
      assert.deepEqual(runtime.packageInvariants, RUNTIME_PACKAGE_INVARIANTS[runtime.name]);
    }
  });

  it('owns package budgets and private script roles', () => {
    assert.equal(PACKAGE_BUDGET.id, 'runtime-package');
    assert.ok(PACKAGE_BUDGET.maxEntryCount > 0);

    const validRoles = new Set(['dev-only', 'release-only']);
    for (const [scriptPath, role] of Object.entries(PRIVATE_SCRIPT_ROLES)) {
      assert.ok(scriptPath.startsWith('src/tooling/'));
      assert.ok(validRoles.has(role.role));
      assert.equal(typeof role.note, 'string');
      assert.notEqual(role.note.length, 0);
    }
  });

  it('keeps package surface rules grounded in artifact projections', () => {
    const ruleIds = PACKAGE_SURFACE_RULES.map((rule) => rule.id);
    assert.deepEqual(ruleIds, [...new Set(ruleIds)]);
    assert.ok(ruleIds.includes('runtime-dist'));

    for (const rule of PACKAGE_SURFACE_RULES) {
      for (const rulePath of [...(rule.exact || []), ...(rule.prefixes || [])]) {
        assert.equal(
          isCoveredByReleaseProjection(rulePath.replace(/\/$/, '')),
          true,
          `${rule.id} path is missing from release projection: ${rulePath}`
        );
      }
    }
  });

  it('keeps runtime dist paths in both projections', () => {
    assert.ok(Object.isFrozen(RUNTIME_DIST_PATHS));
    for (const requiredRuntimePath of [
      'dist/src/bin/maestro-mcp-server.js',
      'dist/src/generated',
      'dist/src/mcp',
      'dist/src/platforms/runtime-declarations.js',
    ]) {
      assert.ok(RUNTIME_DIST_PATHS.includes(requiredRuntimePath));
    }

    for (const rawContentRoot of RAW_DIST_CONTENT_ROOTS) {
      assert.equal(RUNTIME_DIST_PATHS.includes(rawContentRoot), false);
    }

    for (const runtimeDistPath of RUNTIME_DIST_PATHS) {
      assert.ok(npmFiles().includes(runtimeDistPath));
      assert.ok(releasePaths().includes(runtimeDistPath));
    }
  });

  it('centralizes denied path policy for package and release verifiers', () => {
    assert.ok(DENIED_ARTIFACT_PATHS.includes('src'));
    assert.ok(DENIED_ARTIFACT_PATHS.includes('dist/src/tooling'));
    assert.ok(DENIED_ARTIFACT_PATTERNS.some((pattern) => pattern.test('dist/src/mcp/maestro-server.d.ts')));
    assert.ok(DENIED_ARTIFACT_PATTERNS.some((pattern) => pattern.test('tests/unit/example.test.js')));
  });
});
