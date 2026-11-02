'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const { makeTempDir, writeTree } = require('../support/fs');
const { ROOT } = require('../support/paths');

function hookPath(name) {
  return path.join(ROOT, '.githooks', name);
}

function runHook(name, args, { cwd = ROOT, input, env } = {}) {
  return spawnSync('bash', [hookPath(name), ...args], { cwd, input, env, encoding: 'utf8' });
}

function expectHook(result, status, stderr) {
  assert.equal(result.status, status, result.stderr);
  if (stderr) assert.match(result.stderr, stderr);
}

function git(repo, ...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function createRepo(branchName) {
  const repo = makeTempDir('maestro-git-hook-repo-');
  git(repo, 'init');
  git(repo, 'checkout', '-b', branchName);
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test User');
  return repo;
}

// Commits everything in the repo and returns pre-push stdin that pushes the branch as a new ref.
function commitForPush(repo, branch, subject) {
  writeTree(repo, 'file.txt', `${subject}\n`);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', subject);
  return `refs/heads/${branch} ${git(repo, 'rev-parse', 'HEAD').trim()} refs/heads/${branch} ${'0'.repeat(40)}\n`;
}

describe('repo git hooks', () => {
  for (const [name, subject, status, stderr] of [
    ['accepts Conventional Commit subjects', 'feat(core): add semantic hook validation', 0],
    ['accepts git-generated subjects', "Merge branch 'main'", 0],
    ['rejects non-semantic subjects', 'update hook stuff', 1, /Conventional Commits/],
  ]) {
    it(`commit-msg ${name}`, () => {
      const message = writeTree(makeTempDir('maestro-commit-msg-'), 'message', `${subject}\n\nBody\n`);
      expectHook(runHook('commit-msg', [message]), status, stderr);
    });
  }

  for (const [name, branch, status, stderr] of [
    ['accepts semantic branch names', 'codex/chore/enforce-git-conventions', 0],
    ['accepts release branch names', 'release/v1.7.0', 0],
    ['rejects non-semantic branch names', 'feature/hook-validation', 1, /semantic branch convention/],
  ]) {
    it(`pre-commit ${name}`, () => expectHook(runHook('pre-commit', [], { cwd: createRepo(branch) }), status, stderr));
  }

  for (const [name, branch, subject, status, stderr] of [
    ['rejects invalid pushed branch names', 'feature/hook-validation', 'feat(test): seed commit', 1,
      /semantic branch convention/],
    ['rejects invalid pushed commit subjects', 'feat/hook-validation', 'update hook stuff', 1, /Conventional Commits/],
    ['accepts semantic branches with semantic commits', 'feat/hook-validation', 'feat(test): seed commit', 0],
  ]) {
    it(`pre-push ${name}`, () => {
      const repo = createRepo(branch);
      const input = commitForPush(repo, branch, subject);
      expectHook(runHook('pre-push', ['origin', 'unused'], { cwd: repo, input }), status, stderr);
    });
  }

  it('pre-push skips the source-of-truth check only while dev dependencies are missing', () => {
    const repo = createRepo('chore/hook-validation');
    writeTree(repo, 'scripts/generate.js', "require('acorn');\nrequire('acorn-walk');\n");
    const input = commitForPush(repo, 'chore/hook-validation', 'chore(test): seed generator');
    const push = (env) => runHook('pre-push', ['origin', 'unused'], { cwd: repo, input, env });

    expectHook(push({ ...process.env, NODE_PATH: '' }), 0, /dev dependencies missing; run npm ci/);

    writeTree(repo, 'node_modules/acorn/index.js', '');
    writeTree(repo, 'node_modules/acorn-walk/index.js', '');
    const checked = push();
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /source-of-truth clean/);
  });

  it('hand-written allowed-type lists match SEMANTIC_TYPES in semantic-git.sh', () => {
    const branchTypes = execFileSync(
      'bash',
      ['-c', 'source "$1"; printf %s "$SEMANTIC_TYPES"', 'bash', hookPath('lib/semantic-git.sh')],
      { encoding: 'utf8' },
    ).split('|');
    const commitTypes = [...branchTypes, 'release'];
    const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

    const workflow = read('.github/workflows/commit-message-check.yml');
    assert.doesNotMatch(workflow, /Allowed types/, 'commit-message-check.yml should print type lists through semantic-git.sh');

    const hookBlock = read('.githooks/commit-msg').split('echo "Allowed types:"')[1].split('echo ""')[0];
    assert.deepEqual([...hookBlock.matchAll(/echo " {4}([a-z]+) /g)].map((m) => m[1]), commitTypes);

    assert.deepEqual([...read('CONTRIBUTING.md').matchAll(/^\| `([a-z]+)` \|/gm)].map((m) => m[1]), commitTypes);
  });
});
