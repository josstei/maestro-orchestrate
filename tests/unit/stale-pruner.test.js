'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { pruneStaleFiles } = require('../../src/generator/stale-pruner');
const { makeTempDir, writeTree } = require('../support/fs');

describe('pruneStaleFiles', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = makeTempDir('maestro-stale-pruner-');
  });

  it('removes files not in manifest paths', () => {
    writeTree(rootDir, 'qwen/agents/alpha.md', 'alpha');
    writeTree(rootDir, 'qwen/agents/beta.md', 'beta');
    writeTree(rootDir, 'qwen/agents/gamma.md', 'gamma');

    const manifestPaths = new Set(['qwen/agents/alpha.md']);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['qwen/agents'],
    });

    assert.ok(result.pruned.includes('qwen/agents/beta.md'));
    assert.ok(result.pruned.includes('qwen/agents/gamma.md'));
    assert.equal(result.pruned.length, 2);
    assert.ok(fs.existsSync(path.join(rootDir, 'qwen', 'agents', 'alpha.md')));
    assert.ok(!fs.existsSync(path.join(rootDir, 'qwen', 'agents', 'beta.md')));
    assert.ok(!fs.existsSync(path.join(rootDir, 'qwen', 'agents', 'gamma.md')));
  });

  it('keeps files that are in manifest paths and reports nothing when no stale files exist', () => {
    writeTree(rootDir, 'qwen/agents/one.md', 'one');
    writeTree(rootDir, 'qwen/agents/two.md', 'two');
    writeTree(rootDir, 'commands/cmd.toml', 'cmd');

    const manifestPaths = new Set([
      'qwen/agents/one.md',
      'qwen/agents/two.md',
      'commands/cmd.toml',
    ]);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['qwen/agents', 'commands'],
    });

    assert.equal(result.pruned.length, 0);
    assert.equal(result.emptyDirsRemoved.length, 0);
    assert.ok(fs.existsSync(path.join(rootDir, 'qwen', 'agents', 'one.md')));
    assert.ok(fs.existsSync(path.join(rootDir, 'qwen', 'agents', 'two.md')));
    assert.ok(fs.existsSync(path.join(rootDir, 'commands', 'cmd.toml')));
  });

  it('removes empty directories after pruning', () => {
    writeTree(rootDir, 'qwen/agents/nested/deep/stale.md', 'stale');
    writeTree(rootDir, 'qwen/agents/kept.md', 'kept');

    const manifestPaths = new Set(['qwen/agents/kept.md']);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['qwen/agents'],
    });

    assert.ok(result.pruned.includes('qwen/agents/nested/deep/stale.md'));
    assert.ok(result.emptyDirsRemoved.includes('qwen/agents/nested/deep'));
    assert.ok(result.emptyDirsRemoved.includes('qwen/agents/nested'));
    assert.ok(!fs.existsSync(path.join(rootDir, 'qwen', 'agents', 'nested', 'deep')));
    assert.ok(!fs.existsSync(path.join(rootDir, 'qwen', 'agents', 'nested')));
    assert.ok(fs.existsSync(path.join(rootDir, 'qwen', 'agents', 'kept.md')));
  });

  it('handles non-existent owned directories gracefully', () => {
    writeTree(rootDir, 'qwen/agents/valid.md', 'valid');

    const manifestPaths = new Set(['qwen/agents/valid.md']);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['qwen/agents', 'nonexistent-dir', 'another/missing/path'],
    });

    assert.equal(result.pruned.length, 0);
    assert.equal(result.emptyDirsRemoved.length, 0);
    assert.ok(fs.existsSync(path.join(rootDir, 'qwen', 'agents', 'valid.md')));
  });

  it('returns lists of pruned files and removed directories', () => {
    writeTree(rootDir, 'commands/keep.toml', 'keep');
    writeTree(rootDir, 'commands/stale.toml', 'stale');
    writeTree(rootDir, 'commands/sub/orphan.toml', 'orphan');

    const manifestPaths = new Set(['commands/keep.toml']);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['commands'],
    });

    assert.ok(Array.isArray(result.pruned));
    assert.ok(Array.isArray(result.emptyDirsRemoved));
    assert.ok(result.pruned.includes('commands/stale.toml'));
    assert.ok(result.pruned.includes('commands/sub/orphan.toml'));
    assert.ok(result.emptyDirsRemoved.includes('commands/sub'));
    assert.ok(fs.existsSync(path.join(rootDir, 'commands', 'keep.toml')));
  });

  it('handles multiple owned directories independently', () => {
    writeTree(rootDir, 'qwen/agents/agent.md', 'agent');
    writeTree(rootDir, 'qwen/agents/stale-agent.md', 'stale');
    writeTree(rootDir, 'commands/cmd.toml', 'cmd');
    writeTree(rootDir, 'commands/stale-cmd.toml', 'stale');

    const manifestPaths = new Set([
      'qwen/agents/agent.md',
      'commands/cmd.toml',
    ]);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['qwen/agents', 'commands'],
    });

    assert.equal(result.pruned.length, 2);
    assert.ok(result.pruned.includes('qwen/agents/stale-agent.md'));
    assert.ok(result.pruned.includes('commands/stale-cmd.toml'));
  });

  it('leaves files outside the owned directories untouched', () => {
    writeTree(rootDir, 'qwen/agents/stale.md', 'stale');
    writeTree(rootDir, 'qwen/hooks.json', '{}');
    writeTree(rootDir, 'agents/legacy.md', 'legacy');

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths: new Set(),
      ownedDirs: ['qwen/agents'],
    });

    assert.deepEqual(result.pruned, ['qwen/agents/stale.md']);
    assert.deepEqual(result.emptyDirsRemoved, []);
    assert.ok(fs.existsSync(path.join(rootDir, 'qwen', 'agents')));
    assert.ok(fs.existsSync(path.join(rootDir, 'qwen', 'hooks.json')));
    assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'legacy.md')));
  });

  it('does not remove non-empty directories', () => {
    writeTree(rootDir, 'qwen/agents/sub/keep.md', 'keep');
    writeTree(rootDir, 'qwen/agents/sub/stale.md', 'stale');

    const manifestPaths = new Set(['qwen/agents/sub/keep.md']);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['qwen/agents'],
    });

    assert.equal(result.pruned.length, 1);
    assert.ok(result.pruned.includes('qwen/agents/sub/stale.md'));
    assert.equal(result.emptyDirsRemoved.length, 0);
    assert.ok(fs.existsSync(path.join(rootDir, 'qwen', 'agents', 'sub')));
    assert.ok(fs.existsSync(path.join(rootDir, 'qwen', 'agents', 'sub', 'keep.md')));
  });
});
