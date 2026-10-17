const { after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const { ROOT } = require('./helpers');

const ZERO_SHA = '0000000000000000000000000000000000000000';

const tmpDirs = [];

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function hookPath(name) {
  return path.join(ROOT, '.githooks', name);
}

function runHook(name, args = [], options = {}) {
  return spawnSync('bash', [hookPath(name), ...args], {
    cwd: options.cwd || ROOT,
    input: options.input,
    encoding: 'utf8',
  });
}

function writeMessage(subject) {
  const file = path.join(makeTempDir('maestro-commit-msg-'), 'message');
  fs.writeFileSync(file, `${subject}\n\nBody\n`, 'utf8');
  return file;
}

function createRepo(branchName) {
  const repo = makeTempDir('maestro-git-hook-repo-');

  execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['checkout', '-b', branchName], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repo, stdio: 'ignore' });

  return repo;
}

function commitFile(repo, message) {
  const file = path.join(repo, 'file.txt');
  fs.writeFileSync(file, `${message}\n`, 'utf8');
  execFileSync('git', ['add', 'file.txt'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', message], { cwd: repo, stdio: 'ignore' });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
}

function pushInput(branch, sha) {
  return `refs/heads/${branch} ${sha} refs/heads/${branch} ${ZERO_SHA}\n`;
}

describe('repo git hooks', () => {
  it('commit-msg accepts Conventional Commit subjects', () => {
    const result = runHook('commit-msg', [writeMessage('feat(core): add semantic hook validation')]);

    assert.equal(result.status, 0, result.stderr);
  });

  it('commit-msg accepts git-generated subjects', () => {
    const result = runHook('commit-msg', [writeMessage("Merge branch 'main'")]);

    assert.equal(result.status, 0, result.stderr);
  });

  it('commit-msg rejects non-semantic subjects', () => {
    const result = runHook('commit-msg', [writeMessage('update hook stuff')]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Conventional Commits/);
  });

  it('pre-commit accepts semantic branch names', () => {
    const repo = createRepo('codex/chore/enforce-git-conventions');
    const result = runHook('pre-commit', [], { cwd: repo });

    assert.equal(result.status, 0, result.stderr);
  });

  it('pre-commit accepts release branch names', () => {
    const repo = createRepo('release/v1.7.0');
    const result = runHook('pre-commit', [], { cwd: repo });

    assert.equal(result.status, 0, result.stderr);
  });

  it('pre-commit rejects non-semantic branch names', () => {
    const repo = createRepo('feature/hook-validation');
    const result = runHook('pre-commit', [], { cwd: repo });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /semantic branch convention/);
  });

  it('pre-push rejects invalid pushed branch names', () => {
    const repo = createRepo('feature/hook-validation');
    const sha = commitFile(repo, 'feat(test): seed commit');
    const result = runHook('pre-push', ['origin', 'unused'], {
      cwd: repo,
      input: pushInput('feature/hook-validation', sha),
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /semantic branch convention/);
  });

  it('pre-push rejects invalid pushed commit subjects', () => {
    const repo = createRepo('feat/hook-validation');
    const sha = commitFile(repo, 'update hook stuff');
    const result = runHook('pre-push', ['origin', 'unused'], {
      cwd: repo,
      input: pushInput('feat/hook-validation', sha),
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Conventional Commits/);
  });

  it('pre-push accepts semantic branches with semantic commits', () => {
    const repo = createRepo('feat/hook-validation');
    const sha = commitFile(repo, 'feat(test): seed commit');
    const result = runHook('pre-push', ['origin', 'unused'], {
      cwd: repo,
      input: pushInput('feat/hook-validation', sha),
    });

    assert.equal(result.status, 0, result.stderr);
  });
});
