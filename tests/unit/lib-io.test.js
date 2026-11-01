'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  atomicWriteSync,
  formatJson,
  readFileSafe,
  readJsonSafe,
  readTextSync,
} = require('../../src/lib/io');
const { makeTempDir, writeTree } = require('../support/fs');

let tempRoot;
const tmpFiles = (dir = tempRoot) => fs.readdirSync(dir).filter((name) => name.includes('.tmp.'));

beforeEach(() => {
  tempRoot = makeTempDir('maestro-io-');
});

describe('atomicWriteSync', () => {
  for (const [name, relativePath, content, existing] of [
    ['writes content to the target file', 'atomic.txt', 'hello atomic'],
    ['creates parent directories that do not exist', 'deep/nested/dir/file.txt', 'nested content'],
    ['overwrites existing file content', 'overwrite.txt', 'new', 'old'],
    ['handles empty content', 'empty.txt', ''],
  ]) {
    it(name, () => {
      if (existing !== undefined) writeTree(tempRoot, relativePath, existing);
      const filePath = path.join(tempRoot, relativePath);
      atomicWriteSync(filePath, content);
      assert.equal(fs.readFileSync(filePath, 'utf8'), content);
      assert.deepEqual(tmpFiles(path.dirname(filePath)), [], 'no temp files left behind');
    });
  }

  it('writes a unique pid-tagged temp file, then renames it onto the target', (t) => {
    t.mock.method(fs, 'renameSync');
    const fileA = path.join(tempRoot, 'a.txt');
    const fileB = path.join(tempRoot, 'b.txt');
    atomicWriteSync(fileA, 'a');
    atomicWriteSync(fileB, 'b');
    const calls = fs.renameSync.mock.calls.map((call) => call.arguments);
    assert.deepEqual(calls.map(([, dest]) => dest), [fileA, fileB]);
    for (const [src] of calls) assert.ok(src.includes(`.tmp.${process.pid}`), src);
    assert.notEqual(calls[0][0], calls[1][0]);
  });

  it('cleans up temp file when writeFileSync throws', (t) => {
    t.mock.method(fs, 'writeFileSync', () => {
      throw new Error('disk full');
    });
    assert.throws(() => atomicWriteSync(path.join(tempRoot, 'fail.txt'), 'content'), /disk full/);
    assert.deepEqual(tmpFiles(), []);
  });
});

describe('readFileSafe', () => {
  for (const [name, content] of [
    ['reads existing file content as UTF-8', 'file content'],
    ['preserves multi-line content', 'line1\nline2\nline3\n'],
    ['preserves unicode content', 'héllo wörld — 日本語 🎼\n'],
  ]) {
    it(name, () => {
      assert.equal(readFileSafe(writeTree(tempRoot, 'readable.txt', content)), content);
    });
  }

  it('returns the fallback (default empty string) for any unreadable path', () => {
    const missing = path.join(tempRoot, 'missing.txt');
    assert.equal(readFileSafe(missing), '');
    assert.equal(readFileSafe(missing, 'default value'), 'default value');
    assert.equal(readFileSafe(missing, null), null);
    assert.equal(readFileSafe(tempRoot, 'fallback'), 'fallback', 'a directory');
    assert.equal(readFileSafe('/nonexistent/path/file.txt'), '');
  });
});

describe('readTextSync', () => {
  it('normalizes CRLF to LF and keeps a lone CR', () => {
    assert.equal(readTextSync(writeTree(tempRoot, 'crlf.md', 'a\r\nb\rc\n')), 'a\nb\rc\n');
  });
});

describe('readJsonSafe', () => {
  it('parses objects, arrays and primitives', () => {
    for (const data of [{ name: 'maestro', version: 1, nested: { key: 'value' } }, [1, 'two', { three: 3 }], 42]) {
      assert.deepEqual(readJsonSafe(writeTree(tempRoot, 'data.json', JSON.stringify(data))), data);
    }
  });

  it('returns null for a missing, invalid or empty file', () => {
    assert.equal(readJsonSafe(path.join(tempRoot, 'nonexistent.json')), null);
    assert.equal(readJsonSafe(writeTree(tempRoot, 'bad.json', 'not json at all')), null);
    assert.equal(readJsonSafe(writeTree(tempRoot, 'empty.json', '')), null);
  });
});

describe('formatJson', () => {
  it('serializes with 2-space indentation and a trailing newline', () => {
    assert.equal(formatJson({ key: 'value' }), '{\n  "key": "value"\n}\n');
    assert.equal(formatJson([{ id: 'a' }, { id: 'b' }]), '[\n  {\n    "id": "a"\n  },\n  {\n    "id": "b"\n  }\n]\n');
  });
});
