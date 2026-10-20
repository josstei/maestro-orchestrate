'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { makeTempDir, writeTree } = require('../support/fs');
const { ROOT } = require('../support/paths');

const SCRIPT = path.join(ROOT, 'scripts', 'check-layer-boundaries.js');

/**
 * Build a scratch repo that mirrors the expected layout so the script's
 * hardcoded `path.resolve(__dirname, '..', 'src', 'lib')` resolves onto
 * a directory we control.
 */
function makeFixtureRepo() {
  const root = makeTempDir('maestro-lint-');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(root, 'scripts', 'check-layer-boundaries.js'));
  return root;
}

function writeLibFile(root, relPath, contents) {
  writeTree(path.join(root, 'src', 'lib'), relPath, contents);
}

function runScript(root) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', 'check-layer-boundaries.js')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
}

describe('check-layer-boundaries (real repo smoke test)', () => {
  it('passes against the real src/lib tree', () => {
    const result = runScript(ROOT);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /Layer boundaries clean: \d+ files scanned, 0 violations\./);
  });
});

describe('check-layer-boundaries (fixture cases)', () => {
  it('exits 0 and reports 0 files scanned for an empty lib directory', () => {
    const root = makeFixtureRepo();
    const result = runScript(root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /0 files scanned, 0 violations/);
  });

  it('allows relative imports that stay inside src/lib', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'index.js', "const x = require('./helper');\nmodule.exports = x;\n");
    writeLibFile(root, 'helper.js', "module.exports = 1;\n");
    const result = runScript(root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /2 files scanned, 0 violations/);
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
    const { stderr } = result;
    assert.match(stderr, /Layer boundary violations/);
    assert.match(stderr, /leaky\.js/);
    assert.match(stderr, /'\.\.\/core\/logger'/);
  });

  it('flags relative imports into a sibling directory that shares the lib prefix', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'sneaky.js', "const x = require('../lib-extra/x');\n");
    const result = runScript(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sneaky\.js: require\('\.\.\/lib-extra\/x'\)/);
  });

  it('allows relative imports that resolve to the lib directory itself', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'index.js', "module.exports = 1;\n");
    writeLibFile(root, 'nested/user.js', "const lib = require('..');\nmodule.exports = lib;\n");
    const result = runScript(root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /2 files scanned, 0 violations/);
  });

  it('flags non-relative, non-node imports as violations', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'depender.js', "const lodash = require('lodash');\n");
    const result = runScript(root);
    assert.equal(result.status, 1);
    const { stderr } = result;
    assert.match(stderr, /non-relative, non-node import/);
    assert.match(stderr, /'lodash'/);
  });

  it('recurses into nested lib subdirectories', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'a/b/c/deep.js', "const x = require('lodash');\n");
    const result = runScript(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /deep\.js/);
  });

  it('reports multiple violations across several files', () => {
    const root = makeFixtureRepo();
    writeLibFile(root, 'one.js', "require('lodash');\n");
    writeLibFile(root, 'two.js', "require('../core/x');\n");
    writeLibFile(root, 'three.js', "require('./three-helper');\n");
    writeLibFile(root, 'three-helper.js', "module.exports = 1;\n");
    const result = runScript(root);
    assert.equal(result.status, 1);
    const { stderr } = result;
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
    assert.match(result.stdout, /2 files scanned, 0 violations/);
  });
});
