'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { pruneStaleFiles } = require('../../src/generator/stale-pruner');

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-stale-pruner-'));
}

function createFile(rootDir, relativePath, content) {
  const absPath = path.join(rootDir, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content || '', 'utf8');
}

function removeTempRoot(rootDir) {
  fs.rmSync(rootDir, { recursive: true, force: true });
}

describe('pruneStaleFiles', () => {
  it('removes files not in manifest paths', () => {
    const rootDir = createTempRoot();
    try {
      createFile(rootDir, 'agents/alpha.md', 'alpha');
      createFile(rootDir, 'agents/beta.md', 'beta');
      createFile(rootDir, 'agents/gamma.md', 'gamma');

      const manifestPaths = new Set(['agents/alpha.md']);

      const result = pruneStaleFiles({
        rootDir,
        manifestPaths,
        ownedDirs: ['agents'],
      });

      assert.ok(result.pruned.includes('agents/beta.md'));
      assert.ok(result.pruned.includes('agents/gamma.md'));
      assert.equal(result.pruned.length, 2);
      assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'alpha.md')));
      assert.ok(!fs.existsSync(path.join(rootDir, 'agents', 'beta.md')));
      assert.ok(!fs.existsSync(path.join(rootDir, 'agents', 'gamma.md')));
    } finally {
      removeTempRoot(rootDir);
    }
  });

  it('keeps files that are in manifest paths', () => {
    const rootDir = createTempRoot();
    try {
      createFile(rootDir, 'agents/one.md', 'one');
      createFile(rootDir, 'agents/two.md', 'two');
      createFile(rootDir, 'commands/cmd.toml', 'cmd');

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

      assert.equal(result.pruned.length, 0);
      assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'one.md')));
      assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'two.md')));
      assert.ok(fs.existsSync(path.join(rootDir, 'commands', 'cmd.toml')));
    } finally {
      removeTempRoot(rootDir);
    }
  });

  it('removes empty directories after pruning', () => {
    const rootDir = createTempRoot();
    try {
      createFile(rootDir, 'agents/nested/deep/stale.md', 'stale');
      createFile(rootDir, 'agents/kept.md', 'kept');

      const manifestPaths = new Set(['agents/kept.md']);

      const result = pruneStaleFiles({
        rootDir,
        manifestPaths,
        ownedDirs: ['agents'],
      });

      assert.ok(result.pruned.includes('agents/nested/deep/stale.md'));
      assert.ok(result.emptyDirsRemoved.includes('agents/nested/deep'));
      assert.ok(result.emptyDirsRemoved.includes('agents/nested'));
      assert.ok(!fs.existsSync(path.join(rootDir, 'agents', 'nested', 'deep')));
      assert.ok(!fs.existsSync(path.join(rootDir, 'agents', 'nested')));
      assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'kept.md')));
    } finally {
      removeTempRoot(rootDir);
    }
  });

  it('handles non-existent owned directories gracefully', () => {
    const rootDir = createTempRoot();
    try {
      createFile(rootDir, 'agents/valid.md', 'valid');

      const manifestPaths = new Set(['agents/valid.md']);

      const result = pruneStaleFiles({
        rootDir,
        manifestPaths,
        ownedDirs: ['agents', 'nonexistent-dir', 'another/missing/path'],
      });

      assert.equal(result.pruned.length, 0);
      assert.equal(result.emptyDirsRemoved.length, 0);
      assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'valid.md')));
    } finally {
      removeTempRoot(rootDir);
    }
  });

  it('returns lists of pruned files and removed directories', () => {
    const rootDir = createTempRoot();
    try {
      createFile(rootDir, 'commands/keep.toml', 'keep');
      createFile(rootDir, 'commands/stale.toml', 'stale');
      createFile(rootDir, 'commands/sub/orphan.toml', 'orphan');

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
    } finally {
      removeTempRoot(rootDir);
    }
  });

  it('handles multiple owned directories independently', () => {
    const rootDir = createTempRoot();
    try {
      createFile(rootDir, 'agents/agent.md', 'agent');
      createFile(rootDir, 'agents/stale-agent.md', 'stale');
      createFile(rootDir, 'commands/cmd.toml', 'cmd');
      createFile(rootDir, 'commands/stale-cmd.toml', 'stale');

      const manifestPaths = new Set([
        'agents/agent.md',
        'commands/cmd.toml',
      ]);

      const result = pruneStaleFiles({
        rootDir,
        manifestPaths,
        ownedDirs: ['agents', 'commands'],
      });

      assert.equal(result.pruned.length, 2);
      assert.ok(result.pruned.includes('agents/stale-agent.md'));
      assert.ok(result.pruned.includes('commands/stale-cmd.toml'));
    } finally {
      removeTempRoot(rootDir);
    }
  });

  it('does not remove non-empty directories', () => {
    const rootDir = createTempRoot();
    try {
      createFile(rootDir, 'agents/sub/keep.md', 'keep');
      createFile(rootDir, 'agents/sub/stale.md', 'stale');

      const manifestPaths = new Set(['agents/sub/keep.md']);

      const result = pruneStaleFiles({
        rootDir,
        manifestPaths,
        ownedDirs: ['agents'],
      });

      assert.equal(result.pruned.length, 1);
      assert.ok(result.pruned.includes('agents/sub/stale.md'));
      assert.equal(result.emptyDirsRemoved.length, 0);
      assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'sub')));
      assert.ok(fs.existsSync(path.join(rootDir, 'agents', 'sub', 'keep.md')));
    } finally {
      removeTempRoot(rootDir);
    }
  });

  it('returns empty results when no stale files exist', () => {
    const rootDir = createTempRoot();
    try {
      createFile(rootDir, 'agents/a.md', 'a');
      createFile(rootDir, 'agents/b.md', 'b');

      const manifestPaths = new Set(['agents/a.md', 'agents/b.md']);

      const result = pruneStaleFiles({
        rootDir,
        manifestPaths,
        ownedDirs: ['agents'],
      });

      assert.equal(result.pruned.length, 0);
      assert.equal(result.emptyDirsRemoved.length, 0);
    } finally {
      removeTempRoot(rootDir);
    }
  });
});
