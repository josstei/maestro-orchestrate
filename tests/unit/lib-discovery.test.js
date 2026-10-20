'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  discover,
  collectFiles,
} = require('../../src/lib/discovery');

const { parse } = require('../../src/lib/frontmatter');
const { makeTempDir, writeTree } = require('../support/fs');

let tempRoot;

beforeEach(() => {
  tempRoot = makeTempDir('maestro-discovery-');
});

// ---------------------------------------------------------------------------
// collectFiles
// ---------------------------------------------------------------------------

describe('collectFiles', () => {
  it('returns empty array for nonexistent directory', () => {
    const result = collectFiles(path.join(tempRoot, 'nope'), false);
    assert.deepEqual(result, []);
  });

  it('collects files from a flat directory', () => {
    writeTree(tempRoot, 'a.txt', 'a');
    writeTree(tempRoot, 'b.txt', 'b');
    const result = collectFiles(tempRoot, false).map((p) => path.basename(p)).sort();
    assert.deepEqual(result, ['a.txt', 'b.txt']);
  });

  it('does not recurse when recursive is false', () => {
    writeTree(tempRoot, 'top.txt', 'top');
    writeTree(tempRoot, 'sub/nested.txt', 'nested');
    const result = collectFiles(tempRoot, false).map((p) => path.basename(p));
    assert.deepEqual(result, ['top.txt']);
  });

  it('recurses into subdirectories when recursive is true', () => {
    writeTree(tempRoot, 'top.txt', 'top');
    writeTree(tempRoot, 'sub/nested.txt', 'nested');
    writeTree(tempRoot, 'sub/deep/deeper.txt', 'deeper');
    const result = collectFiles(tempRoot, true).map((p) => path.basename(p)).sort();
    assert.deepEqual(result, ['deeper.txt', 'nested.txt', 'top.txt']);
  });

  it('returns empty array for empty directory', () => {
    const emptyDir = path.join(tempRoot, 'empty');
    fs.mkdirSync(emptyDir);
    assert.deepEqual(collectFiles(emptyDir, false), []);
  });
});

// ---------------------------------------------------------------------------
// discover — contract tests
// ---------------------------------------------------------------------------

describe('discover', () => {
  it('discovers files matching a simple extension pattern', () => {
    writeTree(tempRoot, 'one.md', '# One');
    writeTree(tempRoot, 'two.md', '# Two');
    writeTree(tempRoot, 'skip.txt', 'text');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.equal(entries.length, 2);
    assert.equal(entries[0].id, 'one');
    assert.equal(entries[1].id, 'two');
  });

  it('discovers files matching a suffix pattern', () => {
    writeTree(tempRoot, 'session-start-logic.js', '');
    writeTree(tempRoot, 'before-agent-logic.js', '');
    writeTree(tempRoot, 'hook-state.js', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*-logic.js',
      identity: (fp) => path.basename(fp).replace(/-logic\.js$/, ''),
    });

    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((e) => e.id),
      ['before-agent', 'session-start']
    );
  });

  it('sorts entries by id', () => {
    writeTree(tempRoot, 'charlie.md', '');
    writeTree(tempRoot, 'alpha.md', '');
    writeTree(tempRoot, 'bravo.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.deepEqual(
      entries.map((e) => e.id),
      ['alpha', 'bravo', 'charlie']
    );
  });

  it('includes absolute path on each entry', () => {
    const written = writeTree(tempRoot, 'item.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.equal(entries[0].path, written);
  });

  it('extracts metadata when callback is provided', () => {
    writeTree(tempRoot, 'agent.md', '---\nname: coder\ncapabilities: full\n---\nbody');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
      metadata: (_fp, content) => {
        const { frontmatter } = parse(content);
        return { name: frontmatter.name, capabilities: frontmatter.capabilities };
      },
    });

    assert.equal(entries[0].name, 'coder');
    assert.equal(entries[0].capabilities, 'full');
  });

  it('does not read file content when metadata callback is absent', () => {
    writeTree(tempRoot, 'noop.md', 'content');

    const originalReadFileSync = fs.readFileSync;
    let readCalled = false;
    fs.readFileSync = function (...args) {
      if (typeof args[0] === 'string' && args[0].includes('noop.md')) {
        readCalled = true;
      }
      return originalReadFileSync.apply(fs, args);
    };

    try {
      discover({
        dir: tempRoot,
        pattern: '*.md',
        identity: (fp) => path.basename(fp, '.md'),
      });
      assert.equal(readCalled, false);
    } finally {
      fs.readFileSync = originalReadFileSync;
    }
  });

  it('handles recursive scanning via **/ pattern prefix', () => {
    writeTree(tempRoot, 'top.md', '');
    writeTree(tempRoot, 'sub/nested.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '**/*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((e) => e.id),
      ['nested', 'top']
    );
  });

  it('does not scan subdirectories for a flat pattern', () => {
    writeTree(tempRoot, 'top.md', '');
    writeTree(tempRoot, 'sub/nested.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.deepEqual(entries.map((e) => e.id), ['top']);
  });

  it('matches literal pattern characters, including regex metacharacters, exactly', () => {
    writeTree(tempRoot, 'file.test.js', '');
    writeTree(tempRoot, 'filextest.js', '');
    writeTree(tempRoot, 'a.b+c.md', '');
    writeTree(tempRoot, 'a.bbc.md', '');

    const ids = (pattern) => discover({
      dir: tempRoot,
      pattern,
      identity: (fp) => path.basename(fp),
    }).map((e) => e.id);

    assert.deepEqual(ids('file.test.js'), ['file.test.js']);
    assert.deepEqual(ids('a.b+c.md'), ['a.b+c.md']);
  });

  it('anchors the pattern to the full filename', () => {
    writeTree(tempRoot, 'file.js', '');
    writeTree(tempRoot, 'file.js.bak', '');
    writeTree(tempRoot, 'a.md', '');
    writeTree(tempRoot, 'xa.md', '');
    writeTree(tempRoot, 'a.mdx', '');

    const ids = (pattern) => discover({
      dir: tempRoot,
      pattern,
      identity: (fp) => path.basename(fp),
    }).map((e) => e.id);

    assert.deepEqual(ids('*.js'), ['file.js']);
    assert.deepEqual(ids('a.md'), ['a.md']);
  });

  it('returns empty array for nonexistent directory', () => {
    const entries = discover({
      dir: path.join(tempRoot, 'nonexistent'),
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.deepEqual(entries, []);
  });

  it('returns empty array when no files match pattern', () => {
    writeTree(tempRoot, 'file.txt', 'text');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.deepEqual(entries, []);
  });

  it('handles metadata callback returning null gracefully', () => {
    writeTree(tempRoot, 'item.md', 'content');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
      metadata: () => null,
    });

    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'item');
    assert.ok('path' in entries[0]);
  });

  it('spreads metadata properties onto the entry', () => {
    writeTree(tempRoot, 'item.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
      metadata: () => ({ extra: 'value', count: 42 }),
    });

    assert.equal(entries[0].extra, 'value');
    assert.equal(entries[0].count, 42);
  });
});
