'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parsePackJson,
  verifyPackageEntries,
} = require('../../scripts/verify-npm-pack');
const { REQUIRED_PACKAGE_FILES } = require('../../scripts/release-artifact-manifest');

function packWith(...extraPaths) {
  const files = [...REQUIRED_PACKAGE_FILES, ...extraPaths].map((filePath) => ({ path: filePath }));
  return [{ filename: 'pkg.tgz', files }];
}

describe('verify npm pack', () => {
  it('parses npm pack JSON after lifecycle output', () => {
    const parsed = parsePackJson('> prepack\nGeneration complete\n[{"filename":"pkg.tgz","files":[]}]\n');

    assert.equal(parsed[0].filename, 'pkg.tgz');
  });

  it('requires release-critical files in the package', () => {
    assert.doesNotThrow(() => verifyPackageEntries(packWith()));
  });

  it('rejects test-only package content', () => {
    assert.throws(
      () => verifyPackageEntries(packWith('tests/unit/example.test.js')),
      { message: 'npm package contains forbidden path: tests/unit/example.test.js' }
    );
  });

  it('rejects nested test-only files inside runtime package roots', () => {
    for (const forbiddenPath of [
      'claude/scripts/policy-enforcer.test.js',
      'plugins/maestro/src/mcp/server.spec.js',
      'claude/scripts/__tests__/fixture.js',
    ]) {
      assert.throws(
        () => verifyPackageEntries(packWith(forbiddenPath)),
        { message: `npm package contains forbidden path: ${forbiddenPath}` }
      );
    }
  });
});
