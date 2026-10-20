'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { globFiles } = require('../../src/generator/glob-files');
const { makeTempDir, writeTree } = require('../support/fs');

describe('globFiles', () => {
  let rootDir;

  before(() => {
    rootDir = makeTempDir('maestro-glob-files-');
    for (const relPath of [
      'agents/foo-bar.md',
      'agents/baz.md',
      'agents/nested/deep.md',
      'skills/shared/delegation/SKILL.md',
      'skills/shared/delegation/protocols/base-protocol.md',
      'skills/shared/execution/SKILL.md',
      'docs/readme.txt',
      'docs/guide.md',
      'literal/file.test.js',
      'literal/filextest.js',
      'literal/a.b+c.md',
      'literal/a.bbc.md',
      'literal/file.js.bak',
      'literal/xa.md',
      'literal/a.md',
      'literal/a.mdx',
    ]) {
      writeTree(rootDir, relPath);
    }
  });

  it('matches a file-name wildcard in one directory only, as sorted posix paths', () => {
    assert.deepEqual(globFiles(rootDir, 'agents/*.md'), ['agents/baz.md', 'agents/foo-bar.md']);
    assert.deepEqual(globFiles(rootDir, 'docs/*.md'), ['docs/guide.md']);
  });

  it('descends into subdirectories after a ** segment', () => {
    assert.deepEqual(globFiles(rootDir, 'skills/shared/**/SKILL.md'), [
      'skills/shared/delegation/SKILL.md',
      'skills/shared/execution/SKILL.md',
    ]);
    assert.deepEqual(globFiles(rootDir, 'skills/**/*.md'), [
      'skills/shared/delegation/SKILL.md',
      'skills/shared/delegation/protocols/base-protocol.md',
      'skills/shared/execution/SKILL.md',
    ]);
  });

  it('lists every file under the root for **/*', () => {
    const all = globFiles(rootDir, '**/*');

    assert.equal(all.length, 16);
    assert.ok(all.includes('agents/nested/deep.md'));
    assert.ok(all.includes('docs/readme.txt'));
  });

  it('matches only files, and nothing in a missing directory', () => {
    assert.deepEqual(globFiles(rootDir, 'skills/*'), []);
    assert.deepEqual(globFiles(rootDir, 'nonexistent/*.js'), []);
  });

  it('matches every other character literally, including regex metacharacters', () => {
    assert.deepEqual(globFiles(rootDir, 'literal/file.test.js'), ['literal/file.test.js']);
    assert.deepEqual(globFiles(rootDir, 'literal/a.b+c.md'), ['literal/a.b+c.md']);
  });

  it('anchors the pattern to the whole file name', () => {
    assert.deepEqual(globFiles(rootDir, 'literal/*.js'), ['literal/file.test.js', 'literal/filextest.js']);
    assert.deepEqual(globFiles(rootDir, 'literal/a.md'), ['literal/a.md']);
  });

  it('rejects a wildcard outside the file name and a trailing **', () => {
    for (const pattern of ['agents/*/x.md', 'skills/**', 'a/**/b/*.md']) {
      assert.throws(() => globFiles(rootDir, pattern), {
        message: `Unsupported manifest glob: ${pattern}`,
      });
    }
  });
});
