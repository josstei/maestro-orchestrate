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
    assert.deepEqual(REQUIRED_PACKAGE_FILES, [
      'antigravity/plugin.json',
      'bin/maestro-mcp-server.js',
      'claude/.claude-plugin/plugin.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'qwen-extension.json',
      'src/mcp/maestro-server.js',
    ]);
    assert.doesNotThrow(() => verifyPackageEntries(packWith()));
    assert.doesNotThrow(() => verifyPackageEntries(packWith(
      'src/generated/agent-registry.json',
      'src/lib/io/index.js',
    )));
  });

  it('rejects a package that is missing a runtime manifest', () => {
    const [pack] = packWith();

    for (const manifestPath of ['antigravity/plugin.json', 'qwen-extension.json']) {
      const files = pack.files.filter((file) => file.path !== manifestPath);

      assert.throws(
        () => verifyPackageEntries([{ ...pack, files }]),
        { message: `npm package missing required file: ${manifestPath}` }
      );
    }
  });

  // Build and release tooling that only a repository checkout uses, and test-only, cache and
  // scratch files anywhere, including inside runtime package roots.
  for (const [kind, paths] of [
    ['build-only', [
      'scripts/generate.js',
      'scripts/lib/cli.js',
      'src/entry-points/templates/qwen-command.toml.tmpl',
      'src/generator/dependency-graph.js',
      'src/lib/discovery/index.js',
      'src/platforms/metadata.js',
      'src/platforms/qwen/policy-pack.js',
    ]],
    ['forbidden', [
      'tests/unit/example.test.js',
      'claude/scripts/policy-enforcer.test.js',
      'plugins/maestro/src/mcp/server.spec.js',
      'claude/scripts/__tests__/fixture.js',
      'claude/tests/fixtures/helper.js',
      'antigravity/.cache/probe.json',
      'src/tmp/probe.txt',
      'src/scratch/notes.md',
      'plugins/maestro/node_modules/acorn/index.js',
    ]],
  ]) {
    it(`rejects ${kind} package content`, () => {
      for (const extraPath of paths) {
        assert.throws(
          () => verifyPackageEntries(packWith(extraPath)),
          { message: `npm package contains ${kind} path: ${extraPath}` }
        );
      }
    });
  }
});
