#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readJson, runAsMain } = require('./lib/cli');

const ROOT = path.resolve(__dirname, '..');

const COMMIT_IDENTITY = Object.freeze({
  GIT_AUTHOR_NAME: 'maestro-release-bot',
  GIT_AUTHOR_EMAIL: 'maestro-release-bot@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'maestro-release-bot',
  GIT_COMMITTER_EMAIL: 'maestro-release-bot@users.noreply.github.com',
});

function git(cwd, args, options = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    ...options,
  }).trim();
}

function gitQuiet(cwd, args, options = {}) {
  try {
    return git(cwd, args, options);
  } catch (error) {
    return null;
  }
}

function assertCleanTrackedState(root) {
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=no']);

  if (status !== '') {
    throw new Error(
      `Refusing to publish dist branch snapshot: tracked working tree is dirty:\n${status}`
    );
  }
}

function listGeneratorOutputs(worktreePath) {
  const output = execFileSync(
    process.execPath,
    [path.join(worktreePath, 'scripts', 'generate.js'), '--list-outputs'],
    { cwd: worktreePath, encoding: 'utf8' }
  );

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function runGeneratorWriteMode(worktreePath) {
  execFileSync(process.execPath, [path.join(worktreePath, 'scripts', 'generate.js')], {
    cwd: worktreePath,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

function createTemporaryWorktree(root) {
  gitQuiet(root, ['worktree', 'prune']);

  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-dist-worktree-'));
  const worktreePath = path.join(parentDir, 'worktree');

  git(root, ['worktree', 'add', '--detach', worktreePath, 'HEAD']);

  return { worktreePath, parentDir };
}

function removeTemporaryWorktree(root, worktreePath, parentDir) {
  gitQuiet(root, ['worktree', 'remove', '--force', worktreePath]);
  fs.rmSync(parentDir, { recursive: true, force: true });
  gitQuiet(root, ['worktree', 'prune']);
}

function buildOrphanSnapshotCommit(worktreePath, version) {
  runGeneratorWriteMode(worktreePath);
  const outputs = listGeneratorOutputs(worktreePath);

  git(worktreePath, ['add', '-A']);

  for (const outputPath of outputs) {
    git(worktreePath, ['add', '-f', '--', outputPath]);
  }

  const treeSha = git(worktreePath, ['write-tree']);

  return git(
    worktreePath,
    ['commit-tree', treeSha, '-m', `dist: v${version} generated snapshot`],
    { env: { ...process.env, ...COMMIT_IDENTITY } }
  );
}

function publishDistBranch(options = {}) {
  const root = options.root || ROOT;

  assertCleanTrackedState(root);

  const { worktreePath, parentDir } = createTemporaryWorktree(root);

  try {
    const version = readJson(path.join(worktreePath, 'package.json')).version;
    const sha = buildOrphanSnapshotCommit(worktreePath, version);

    return { sha, version };
  } finally {
    removeTemporaryWorktree(root, worktreePath, parentDir);
  }
}

runAsMain(module, 'dist branch publish', () => {
  const result = publishDistBranch();
  console.log(result.sha);
});

module.exports = {
  publishDistBranch,
};
