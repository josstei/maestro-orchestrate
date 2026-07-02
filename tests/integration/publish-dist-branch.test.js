'use strict';

// Integration-weight: this suite runs the REAL scripts/publish-dist-branch.js
// script (including a real `git worktree add` and a real
// `node scripts/generate.js` run) against a disposable git repository built
// from a full copy of this repo's source tree. It intentionally does not use
// a hand-rolled minimal fixture (a fake package.json/generator) -- the whole
// point is to exercise the actual generator pipeline. It also does not touch
// the developer's live checkout: the fixture gets its own throwaway `git
// init`, so every git operation the script performs (worktree add/remove,
// commit-tree) is fully isolated from this repository's real HEAD, branches,
// and working tree.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { createTempRepoCopy } = require('./helpers');
const { publishDistBranch } = require('../../scripts/publish-dist-branch');
const packageJson = require('../../package.json');

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  }).trim();
}

function initFixtureRepo(prefix) {
  const repoRoot = createTempRepoCopy(prefix);

  git(repoRoot, ['init', '-b', 'main']);
  git(repoRoot, ['config', 'user.name', 'Fixture User']);
  git(repoRoot, ['config', 'user.email', 'fixture@example.com']);
  git(repoRoot, ['add', '-A']);
  git(repoRoot, ['commit', '-m', 'chore: fixture snapshot']);

  return repoRoot;
}

function cleanupFixtureRepo(repoRoot) {
  fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
}

describe('publish dist branch (integration)', () => {
  it('creates a full generated snapshot commit and leaves the fixture checkout untouched', () => {
    const repoRoot = initFixtureRepo('maestro-dist-branch-');

    try {
      const beforeHead = git(repoRoot, ['rev-parse', 'HEAD']);
      const beforeBranch = git(repoRoot, ['symbolic-ref', '--short', 'HEAD']);
      const beforeStatus = git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
      const beforeWorktrees = git(repoRoot, ['worktree', 'list', '--porcelain']);

      const result = publishDistBranch({ root: repoRoot });

      assert.match(result.sha, /^[0-9a-f]{40}$/, 'expected a full commit SHA');
      assert.equal(result.version, packageJson.version);
      assert.equal(git(repoRoot, ['cat-file', '-t', result.sha]), 'commit');
      assert.equal(
        git(repoRoot, ['log', '-1', '--format=%P', result.sha]),
        '',
        'dist snapshot commit must be a parentless (orphan) root commit'
      );
      assert.equal(
        git(repoRoot, ['log', '-1', '--format=%s', result.sha]),
        `dist: v${result.version} generated snapshot`
      );

      const treeEntries = git(repoRoot, ['ls-tree', '-r', '--name-only', result.sha]).split('\n');
      assert.ok(treeEntries.includes('package.json'), 'expected a tracked source file in the snapshot tree');
      assert.ok(treeEntries.includes('GEMINI.md'), 'expected a generator output in the snapshot tree');
      assert.ok(
        treeEntries.includes('src/generated/agent-registry.json'),
        'expected a generated registry in the snapshot tree'
      );
      assert.ok(treeEntries.includes('agents/coder.md'), 'expected a generated agent stub in the snapshot tree');

      assert.equal(git(repoRoot, ['rev-parse', 'HEAD']), beforeHead, 'fixture HEAD must be unchanged');
      assert.equal(
        git(repoRoot, ['symbolic-ref', '--short', 'HEAD']),
        beforeBranch,
        'fixture branch must be unchanged'
      );
      assert.equal(
        git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']),
        beforeStatus,
        'fixture working tree must be unchanged'
      );
      assert.equal(
        git(repoRoot, ['worktree', 'list', '--porcelain']),
        beforeWorktrees,
        'no worktree should be left registered after publish'
      );
      assert.equal(fs.existsSync(path.join(repoRoot, '.git', 'worktrees')), false);
    } finally {
      cleanupFixtureRepo(repoRoot);
    }
  });

  it('refuses to run when the tracked working tree is dirty', () => {
    const repoRoot = initFixtureRepo('maestro-dist-branch-dirty-');

    try {
      fs.appendFileSync(path.join(repoRoot, 'package.json'), '\n');

      assert.throws(
        () => publishDistBranch({ root: repoRoot }),
        /Refusing to publish dist branch snapshot: tracked working tree is dirty/
      );

      assert.equal(
        git(repoRoot, ['worktree', 'list', '--porcelain']).split('\n\n').filter(Boolean).length,
        1,
        'no worktree should have been created before the dirty-state guard rejected the run'
      );
    } finally {
      cleanupFixtureRepo(repoRoot);
    }
  });
});
