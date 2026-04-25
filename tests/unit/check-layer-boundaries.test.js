'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-layer-boundaries.js');

const tmpDirs = [];

/**
 * Build a scratch repo that mirrors the expected layout so the script's
 * hardcoded `path.resolve(__dirname, '..', 'src', 'lib')` resolves onto
 * a directory we control.
 */
function makeFixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-lint-'));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(root, 'scripts', 'check-layer-boundaries.js'));
  return root;
}

function writeLibFile(root, relPath, contents) {
  const abs = path.join(root, 'src', 'lib', relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

function runScript(root) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', 'check-layer-boundaries.js')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

after(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-layer-boundaries (real repo smoke test)', () => {
  it('passes against the real src/lib tree', () => {
    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr.toString('utf8')}`);
    assert.match(result.stdout.toString('utf8'), /Layer boundaries clean: \d+ files scanned, 0 violations\./);
  });
});

describe('check-layer-boundaries (fixture cases)', () => {
  it('exits 0 and reports 0 files scanned for an empty lib directory', () => {
    const root = makeFixtureRepo();
    const result = runScript(root);
    assert.equal(result.status, 0);
    assert.match(result.stdout.toString('utf8'), /0 files scanned, 0 violations/);
  });

  it('allows relative imports that stay inside src/lib', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'index.js', "const x = require('./helper');\nmodule.exports = x;\n");
    writeLibFile(root, 'helper.js', "module.exports = 1;\n");
    const result = runScript(root);
    assert.equal(result.status, 0);
    assert.match(result.stdout.toString('utf8'), /2 files scanned, 0 violations/);
  });

  it('allows node: built-in imports', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'fs-user.js', "const fs = require('node:fs');\nmodule.exports = fs;\n");
    const result = runScript(root);
    assert.equal(result.status, 0);
  });

  it('flags relative imports that escape the lib boundary', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'leaky.js', "const x = require('../core/logger');\n");
    const result = runScript(root);
    assert.equal(result.status, 1);
    const stderr = result.stderr.toString('utf8');
    assert.match(stderr, /Layer boundary violations/);
    assert.match(stderr, /leaky\.js/);
    assert.match(stderr, /'\.\.\/core\/logger'/);
  });

  it('flags non-relative, non-node imports as violations', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'depender.js', "const lodash = require('lodash');\n");
    const result = runScript(root);
    assert.equal(result.status, 1);
    const stderr = result.stderr.toString('utf8');
    assert.match(stderr, /non-relative, non-node import/);
    assert.match(stderr, /'lodash'/);
  });

  it('recurses into nested lib subdirectories', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'a/b/c/deep.js', "const x = require('lodash');\n");
    const result = runScript(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr.toString('utf8'), /deep\.js/);
  });

  it('reports multiple violations across several files', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'one.js', "require('lodash');\n");
    writeLibFile(root, 'two.js', "require('../core/x');\n");
    writeLibFile(root, 'three.js', "require('./three-helper');\n");
    writeLibFile(root, 'three-helper.js', "module.exports = 1;\n");
    const result = runScript(root);
    assert.equal(result.status, 1);
    const stderr = result.stderr.toString('utf8');
    assert.match(stderr, /one\.js/);
    assert.match(stderr, /two\.js/);
    assert.ok(!stderr.includes('three.js:'), 'three.js should be clean');
  });

  it('ignores non-.js files in lib', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'README.md', "require('lodash')\n");
    writeLibFile(root, 'ok.js', "require('./other');\n");
    writeLibFile(root, 'other.js', "module.exports = 1;\n");
    const result = runScript(root);
    assert.equal(result.status, 0);
    assert.match(result.stdout.toString('utf8'), /2 files scanned, 0 violations/);
  });
});
