'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findFiles } = require('../../src/lib/discovery');
const { makeTempDir, writeTree } = require('../support/fs');

let root;
beforeEach(() => { root = makeTempDir('maestro-discovery-'); });
const names = (pattern) => findFiles(root, pattern).map((file) => path.relative(root, file).split(path.sep).join('/')).sort();

describe('findFiles', () => {
  it('matches regular files in the requested directory without descending by default', () => {
    writeTree(root, 'one.md', '');
    writeTree(root, 'two.md', '');
    writeTree(root, 'nested/three.md', '');
    writeTree(root, 'skip.txt', '');
    fs.mkdirSync(path.join(root, 'directory.md'));
    assert.deepEqual(names('*.md'), ['one.md', 'two.md']);
    assert.ok(findFiles(root, '*.md').every((file) => path.isAbsolute(file)));
  });

  it('descends into every subdirectory only with a recursive prefix', () => {
    writeTree(root, 'top.md', '');
    writeTree(root, 'sub/nested.md', '');
    writeTree(root, 'sub/deep/deeper.md', '');
    assert.deepEqual(names('**/*.md'), ['sub/deep/deeper.md', 'sub/nested.md', 'top.md']);
  });

  it('matches suffixes and literal regex metacharacters against the complete filename', () => {
    for (const file of ['session-start-logic.js', 'hook-state.js', 'file.test.js', 'filextest.js', 'a.b+c.md', 'a.bbc.md', 'file.js.bak']) {
      writeTree(root, file, '');
    }
    assert.deepEqual(names('*-logic.js'), ['session-start-logic.js']);
    assert.deepEqual(names('file.test.js'), ['file.test.js']);
    assert.deepEqual(names('a.b+c.md'), ['a.b+c.md']);
    assert.ok(!names('*.js').includes('file.js.bak'));
  });

  it('returns no matches for empty, missing and unmatched directories', () => {
    assert.deepEqual(findFiles(path.join(root, 'missing'), '*.md'), []);
    assert.deepEqual(names('*.md'), []);
    writeTree(root, 'file.txt', '');
    assert.deepEqual(names('*.md'), []);
  });

  it('does not read file contents or follow symlink entries', (t) => {
    writeTree(root, 'regular.md', 'content');
    const outside = makeTempDir('maestro-discovery-target-');
    writeTree(outside, 'external.md', 'outside');
    fs.symlinkSync(outside, path.join(root, 'linked-dir'), 'dir');
    fs.symlinkSync(path.join(outside, 'external.md'), path.join(root, 'linked.md'), 'file');
    t.mock.method(fs, 'readFileSync', () => { throw new Error('Discovery must only inspect paths'); });
    assert.deepEqual(names('**/*.md'), ['regular.md']);
  });
});
