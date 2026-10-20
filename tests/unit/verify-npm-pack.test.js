'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parsePackJson,
  verifyPackageEntries,
} = require('../../scripts/verify-npm-pack');
const { ROOT } = require('../support/paths');

const REQUIRED_PACKAGE_FILES = [
  'antigravity/plugin.json',
  'bin/maestro-mcp-server.js',
  'claude/.claude-plugin/plugin.json',
  'plugins/maestro/.codex-plugin/plugin.json',
  'qwen-extension.json',
  'src/mcp/maestro-server.js',
];

function packWith(...extraPaths) {
  const files = [...REQUIRED_PACKAGE_FILES, ...extraPaths].map((filePath) => ({ path: filePath }));
  return [{ filename: 'pkg.tgz', files }];
}

describe('verify npm pack', () => {
  it('parses npm pack JSON after lifecycle output', () => {
    const parsed = parsePackJson('> prepack\nGeneration complete\n[{"filename":"pkg.tgz","files":[]}]\n');

    assert.equal(parsed[0].filename, 'pkg.tgz');
  });

  it('requires exactly the release-critical files in the package', () => {
    const [pack] = packWith();
    assert.doesNotThrow(() => verifyPackageEntries([pack]));

    for (const requiredPath of REQUIRED_PACKAGE_FILES) {
      const files = pack.files.filter((file) => file.path !== requiredPath);

      assert.throws(
        () => verifyPackageEntries([{ ...pack, files }]),
        { message: `npm package missing required file: ${requiredPath}` }
      );
    }
  });

  it('requires only files that exist in the repo', () => {
    for (const requiredPath of REQUIRED_PACKAGE_FILES) {
      assert.ok(fs.existsSync(path.join(ROOT, requiredPath)), `${requiredPath} is missing from the repo`);
    }
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
