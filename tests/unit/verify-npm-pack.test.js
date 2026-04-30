'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parsePackJson,
  verifyPackageEntries,
} = require('../../scripts/verify-npm-pack');

describe('verify npm pack', () => {
  it('parses npm pack JSON after lifecycle output', () => {
    const parsed = parsePackJson('> prepack\nGeneration complete\n[{"filename":"pkg.tgz","files":[]}]\n');

    assert.equal(parsed[0].filename, 'pkg.tgz');
  });

  it('requires release-critical files in the package', () => {
    const files = [
      'bin/maestro-mcp-server.js',
      'claude/.claude-plugin/plugin.json',
      'gemini-extension.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'qwen-extension.json',
      'src/mcp/maestro-server.js',
    ].map((filePath) => ({ path: filePath }));

    assert.doesNotThrow(() => verifyPackageEntries([{ filename: 'pkg.tgz', files }]));
  });

  it('rejects test-only package content', () => {
    const files = [
      'bin/maestro-mcp-server.js',
      'claude/.claude-plugin/plugin.json',
      'gemini-extension.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'qwen-extension.json',
      'src/mcp/maestro-server.js',
      'tests/unit/example.test.js',
    ].map((filePath) => ({ path: filePath }));

    assert.throws(
      () => verifyPackageEntries([{ filename: 'pkg.tgz', files }]),
      /npm package contains forbidden path: tests\/unit\/example\.test\.js/
    );
  });

  it('rejects nested test-only files inside runtime package roots', () => {
    const requiredFiles = [
      'bin/maestro-mcp-server.js',
      'claude/.claude-plugin/plugin.json',
      'gemini-extension.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'qwen-extension.json',
      'src/mcp/maestro-server.js',
    ];

    for (const forbiddenPath of [
      'claude/scripts/policy-enforcer.test.js',
      'plugins/maestro/src/mcp/server.spec.js',
      'claude/scripts/__tests__/fixture.js',
    ]) {
      const files = [
        ...requiredFiles,
        forbiddenPath,
      ].map((filePath) => ({ path: filePath }));

      assert.throws(
        () => verifyPackageEntries([{ filename: 'pkg.tgz', files }]),
        new RegExp(`npm package contains forbidden path: ${forbiddenPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
  });
});
