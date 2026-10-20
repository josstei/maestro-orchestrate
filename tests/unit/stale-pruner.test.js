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
    writeTree(rootDir, 'agents/alpha.md', 'alpha');
    writeTree(rootDir, 'agents/beta.md', 'beta');
    writeTree(rootDir, 'agents/gamma.md', 'gamma');

    const manifestPaths = new Set(['agents/alpha.md']);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['agents'],
    });

    assert.deepEqual(result, ['agents/beta.md', 'agents/gamma.md']);
    assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'alpha.md')));
    assert.ok(!fs.existsSync(path.join(rootDir, 'agents', 'beta.md')));
    assert.ok(!fs.existsSync(path.join(rootDir, 'agents', 'gamma.md')));
  });

  it('keeps files that are in manifest paths and reports nothing when no stale files exist', () => {
    writeTree(rootDir, 'agents/one.md', 'one');
    writeTree(rootDir, 'agents/two.md', 'two');
    writeTree(rootDir, 'commands/cmd.toml', 'cmd');

    const manifestPaths = new Set([
      'agents/one.md',
      'agents/two.md',
      'commands/cmd.toml',
    ]);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['agents', 'commands'],
    });

    assert.deepEqual(result, []);
    assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'one.md')));
    assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'two.md')));
    assert.ok(fs.existsSync(path.join(rootDir, 'commands', 'cmd.toml')));
  });

  it('removes empty directories after pruning', () => {
    writeTree(rootDir, 'agents/nested/deep/stale.md', 'stale');
    writeTree(rootDir, 'agents/kept.md', 'kept');

    const manifestPaths = new Set(['agents/kept.md']);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['agents'],
    });

    assert.deepEqual(result, ['agents/nested/deep/stale.md']);
    assert.ok(!fs.existsSync(path.join(rootDir, 'agents', 'nested', 'deep')));
    assert.ok(!fs.existsSync(path.join(rootDir, 'agents', 'nested')));
    assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'kept.md')));
  });

  it('handles non-existent owned directories gracefully', () => {
    writeTree(rootDir, 'agents/valid.md', 'valid');

    const manifestPaths = new Set(['agents/valid.md']);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['agents', 'nonexistent-dir', 'another/missing/path'],
    });

    assert.deepEqual(result, []);
    assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'valid.md')));
  });

  it('returns the pruned files and removes the subdirectories they leave empty', () => {
    writeTree(rootDir, 'commands/keep.toml', 'keep');
    writeTree(rootDir, 'commands/stale.toml', 'stale');
    writeTree(rootDir, 'commands/sub/orphan.toml', 'orphan');

    const manifestPaths = new Set(['commands/keep.toml']);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['commands'],
    });

    assert.deepEqual(result, ['commands/stale.toml', 'commands/sub/orphan.toml']);
    assert.ok(!fs.existsSync(path.join(rootDir, 'commands', 'sub')));
    assert.ok(fs.existsSync(path.join(rootDir, 'commands', 'keep.toml')));
  });

  it('handles multiple owned directories independently', () => {
    writeTree(rootDir, 'agents/agent.md', 'agent');
    writeTree(rootDir, 'agents/stale-agent.md', 'stale');
    writeTree(rootDir, 'commands/cmd.toml', 'cmd');
    writeTree(rootDir, 'commands/stale-cmd.toml', 'stale');

    const manifestPaths = new Set([
      'agents/agent.md',
      'commands/cmd.toml',
    ]);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['agents', 'commands'],
    });

    assert.deepEqual(result, ['agents/stale-agent.md', 'commands/stale-cmd.toml']);
  });

  it('lists a stale subdirectory\'s files at the subdirectory name\'s position', () => {
    writeTree(rootDir, 'commands/maestro.toml', 'stale');
    writeTree(rootDir, 'commands/maestro-old.toml', 'stale');
    writeTree(rootDir, 'commands/maestro/review.toml', 'stale');

    const result = pruneStaleFiles({ rootDir, manifestPaths: new Set(), ownedDirs: ['commands'] });

    assert.deepEqual(result, [
      'commands/maestro/review.toml',
      'commands/maestro-old.toml',
      'commands/maestro.toml',
    ]);
  });

  it('leaves files outside the owned directories untouched', () => {
    writeTree(rootDir, 'agents/stale.md', 'stale');
    writeTree(rootDir, 'qwen/hooks.json', '{}');
    writeTree(rootDir, 'claude/agents/legacy.md', 'legacy');

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths: new Set(),
      ownedDirs: ['agents'],
    });

    assert.deepEqual(result, ['agents/stale.md']);
    assert.ok(fs.existsSync(path.join(rootDir, 'agents')), 'an owned directory is never removed');
    assert.ok(fs.existsSync(path.join(rootDir, 'qwen', 'hooks.json')));
    assert.ok(fs.existsSync(path.join(rootDir, 'claude', 'agents', 'legacy.md')));
  });

  it('prunes owned subdirectories of a plugin dir without touching its other files', () => {
    writeTree(rootDir, 'antigravity/agents/coder.md', 'coder');
    writeTree(rootDir, 'antigravity/agents/retired.md', 'stale');
    writeTree(rootDir, 'antigravity/skills/orchestrate/SKILL.md', 'orchestrate');
    writeTree(rootDir, 'antigravity/skills/retired/SKILL.md', 'stale');
    writeTree(rootDir, 'antigravity/hooks/hook-runner.js', 'shim');
    writeTree(rootDir, 'antigravity/mcp/maestro-server.js', 'shim');
    writeTree(rootDir, 'antigravity/README.md', 'readme');

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths: new Set([
        'antigravity/agents/coder.md',
        'antigravity/skills/orchestrate/SKILL.md',
      ]),
      ownedDirs: ['antigravity/agents', 'antigravity/skills'],
    });

    assert.deepEqual(result, [
      'antigravity/agents/retired.md',
      'antigravity/skills/retired/SKILL.md',
    ]);
    assert.ok(!fs.existsSync(path.join(rootDir, 'antigravity', 'skills', 'retired')));
    assert.ok(fs.existsSync(path.join(rootDir, 'antigravity', 'skills', 'orchestrate')));
    for (const kept of ['hooks/hook-runner.js', 'mcp/maestro-server.js', 'README.md']) {
      assert.ok(fs.existsSync(path.join(rootDir, 'antigravity', kept)), kept);
    }
  });

  it('does not remove non-empty directories', () => {
    writeTree(rootDir, 'agents/sub/keep.md', 'keep');
    writeTree(rootDir, 'agents/sub/stale.md', 'stale');

    const manifestPaths = new Set(['agents/sub/keep.md']);

    const result = pruneStaleFiles({
      rootDir,
      manifestPaths,
      ownedDirs: ['agents'],
    });

    assert.deepEqual(result, ['agents/sub/stale.md']);
    assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'sub')));
    assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'sub', 'keep.md')));
  });

  it('prunes the whole tree for the root owned directory without removing the root', () => {
    writeTree(rootDir, 'payload/version.json', '{}');
    writeTree(rootDir, 'payload/lib/kept.js', 'kept');
    writeTree(rootDir, 'payload/lib/orphaned-dir/gone.js', 'gone');
    writeTree(rootDir, 'payload/stale.js', 'stale');
    const payloadDir = path.join(rootDir, 'payload');

    const result = pruneStaleFiles({
      rootDir: payloadDir,
      manifestPaths: new Set(['version.json', 'lib/kept.js']),
      ownedDirs: [''],
    });

    assert.deepEqual(result, ['lib/orphaned-dir/gone.js', 'stale.js']);
    assert.ok(!fs.existsSync(path.join(payloadDir, 'lib', 'orphaned-dir')));
    assert.ok(fs.existsSync(path.join(payloadDir, 'lib', 'kept.js')));
    assert.ok(fs.existsSync(payloadDir));
  });
});
