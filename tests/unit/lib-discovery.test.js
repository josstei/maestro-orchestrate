'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  discover,
  serializeRegistry,
  collectFiles,
} = require('../../src/lib/discovery');

const { parse } = require('../../src/lib/frontmatter');

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-discovery-'));
}

function removeTempRoot(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(base, relativePath, content) {
  const full = path.join(base, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

// ---------------------------------------------------------------------------
// collectFiles
// ---------------------------------------------------------------------------

describe('collectFiles', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('returns empty array for nonexistent directory', () => {
    const result = collectFiles(path.join(tempRoot, 'nope'), false);
    assert.deepEqual(result, []);
  });

  it('collects files from a flat directory', () => {
    writeFile(tempRoot, 'a.txt', 'a');
    writeFile(tempRoot, 'b.txt', 'b');
    const result = collectFiles(tempRoot, false).map((p) => path.basename(p)).sort();
    assert.deepEqual(result, ['a.txt', 'b.txt']);
  });

  it('does not recurse when recursive is false', () => {
    writeFile(tempRoot, 'top.txt', 'top');
    writeFile(tempRoot, 'sub/nested.txt', 'nested');
    const result = collectFiles(tempRoot, false).map((p) => path.basename(p));
    assert.deepEqual(result, ['top.txt']);
  });

  it('recurses into subdirectories when recursive is true', () => {
    writeFile(tempRoot, 'top.txt', 'top');
    writeFile(tempRoot, 'sub/nested.txt', 'nested');
    writeFile(tempRoot, 'sub/deep/deeper.txt', 'deeper');
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
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('discovers files matching a simple extension pattern', () => {
    writeFile(tempRoot, 'one.md', '# One');
    writeFile(tempRoot, 'two.md', '# Two');
    writeFile(tempRoot, 'skip.txt', 'text');

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
    writeFile(tempRoot, 'session-start-logic.js', '');
    writeFile(tempRoot, 'before-agent-logic.js', '');
    writeFile(tempRoot, 'hook-state.js', '');

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
    writeFile(tempRoot, 'charlie.md', '');
    writeFile(tempRoot, 'alpha.md', '');
    writeFile(tempRoot, 'bravo.md', '');

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
    const written = writeFile(tempRoot, 'item.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.equal(entries[0].path, written);
  });

  it('extracts metadata when callback is provided', () => {
    writeFile(tempRoot, 'agent.md', '---\nname: coder\ncapabilities: full\n---\nbody');

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
    writeFile(tempRoot, 'noop.md', 'content');

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
    writeFile(tempRoot, 'top.md', '');
    writeFile(tempRoot, 'sub/nested.md', '');

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
    writeFile(tempRoot, 'top.md', '');
    writeFile(tempRoot, 'sub/nested.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.deepEqual(entries.map((e) => e.id), ['top']);
  });

  it('matches literal pattern characters, including regex metacharacters, exactly', () => {
    writeFile(tempRoot, 'file.test.js', '');
    writeFile(tempRoot, 'filextest.js', '');
    writeFile(tempRoot, 'a.b+c.md', '');
    writeFile(tempRoot, 'a.bbc.md', '');

    const ids = (pattern) => discover({
      dir: tempRoot,
      pattern,
      identity: (fp) => path.basename(fp),
    }).map((e) => e.id);

    assert.deepEqual(ids('file.test.js'), ['file.test.js']);
    assert.deepEqual(ids('a.b+c.md'), ['a.b+c.md']);
  });

  it('anchors the pattern to the full filename', () => {
    writeFile(tempRoot, 'file.js', '');
    writeFile(tempRoot, 'file.js.bak', '');
    writeFile(tempRoot, 'a.md', '');
    writeFile(tempRoot, 'xa.md', '');
    writeFile(tempRoot, 'a.mdx', '');

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
    writeFile(tempRoot, 'file.txt', 'text');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.deepEqual(entries, []);
  });

  it('handles metadata callback returning null gracefully', () => {
    writeFile(tempRoot, 'item.md', 'content');

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
    writeFile(tempRoot, 'item.md', '');

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

// ---------------------------------------------------------------------------
// serializeRegistry
// ---------------------------------------------------------------------------

describe('serializeRegistry', () => {
  it('serializes a JSON array with trailing newline', () => {
    const content = serializeRegistry([{ id: 'a' }, { id: 'b' }]);
    assert.ok(content.endsWith('\n'));
    assert.deepEqual(JSON.parse(content), [{ id: 'a' }, { id: 'b' }]);
  });

  it('serializes a JSON object with trailing newline', () => {
    const content = serializeRegistry({ 'session-start': { module: 'm', fn: 'f' } });
    assert.ok(content.endsWith('\n'));
    assert.deepEqual(JSON.parse(content), { 'session-start': { module: 'm', fn: 'f' } });
  });

  it('uses 2-space indentation', () => {
    const content = serializeRegistry({ key: 'value' });
    assert.ok(content.includes('  "key"'));
  });
});
