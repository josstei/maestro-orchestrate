'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  atomicWriteSync,
  readFileSafe,
  readJsonSafe,
  writeIfChanged,
  ensureDir,
} = require('../../src/lib/io');

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-io-'));
}

function removeTempRoot(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('atomicWriteSync', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('writes content to the target file', () => {
    const filePath = path.join(tempRoot, 'atomic.txt');
    atomicWriteSync(filePath, 'hello atomic');
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'hello atomic');
  });

  it('creates parent directories that do not exist', () => {
    const filePath = path.join(tempRoot, 'deep', 'nested', 'dir', 'file.txt');
    atomicWriteSync(filePath, 'nested content');
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'nested content');
  });

  it('overwrites existing file content', () => {
    const filePath = path.join(tempRoot, 'overwrite.txt');
    fs.writeFileSync(filePath, 'old', 'utf8');
    atomicWriteSync(filePath, 'new');
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'new');
  });

  it('does not leave temp files behind on success', () => {
    const filePath = path.join(tempRoot, 'clean.txt');
    atomicWriteSync(filePath, 'content');
    const files = fs.readdirSync(tempRoot);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    assert.equal(tmpFiles.length, 0);
  });

  it('uses temp-file-then-rename strategy', () => {
    const original = fs.renameSync;
    let renameCalled = false;
    let renameArgs = [];

    fs.renameSync = function (src, dest) {
      renameCalled = true;
      renameArgs = [src, dest];
      return original.call(fs, src, dest);
    };

    try {
      const filePath = path.join(tempRoot, 'strategy.txt');
      atomicWriteSync(filePath, 'verify strategy');
      assert.ok(renameCalled, 'renameSync must be called');
      assert.equal(renameArgs[1], filePath);
      assert.ok(renameArgs[0].includes('.tmp.'), 'source must be a temp file');
      assert.ok(renameArgs[0].includes(`${process.pid}`), 'temp file must include pid');
    } finally {
      fs.renameSync = original;
    }
  });

  it('cleans up temp file when writeFileSync throws', () => {
    const originalWrite = fs.writeFileSync;
    fs.writeFileSync = function () {
      throw new Error('disk full');
    };

    try {
      const filePath = path.join(tempRoot, 'fail.txt');
      assert.throws(() => atomicWriteSync(filePath, 'content'), /disk full/);
      const files = fs.readdirSync(path.dirname(filePath));
      const tmpFiles = files.filter((f) => f.includes('.tmp.'));
      assert.equal(tmpFiles.length, 0);
    } finally {
      fs.writeFileSync = originalWrite;
    }
  });

  it('propagates the original error after cleanup', () => {
    const originalWrite = fs.writeFileSync;
    fs.writeFileSync = function () {
      throw new Error('simulated failure');
    };

    try {
      const filePath = path.join(tempRoot, 'propagate.txt');
      assert.throws(() => atomicWriteSync(filePath, 'x'), /simulated failure/);
    } finally {
      fs.writeFileSync = originalWrite;
    }
  });

  it('handles empty content', () => {
    const filePath = path.join(tempRoot, 'empty.txt');
    atomicWriteSync(filePath, '');
    assert.equal(fs.readFileSync(filePath, 'utf8'), '');
  });

  it('generates unique temp file names across sequential calls', () => {
    const original = fs.renameSync;
    const tempNames = [];

    fs.renameSync = function (src, dest) {
      tempNames.push(src);
      return original.call(fs, src, dest);
    };

    try {
      const fileA = path.join(tempRoot, 'a.txt');
      const fileB = path.join(tempRoot, 'b.txt');
      atomicWriteSync(fileA, 'a');
      atomicWriteSync(fileB, 'b');
      assert.equal(tempNames.length, 2);
      assert.notEqual(tempNames[0], tempNames[1]);
    } finally {
      fs.renameSync = original;
    }
  });
});

describe('readFileSafe', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('reads existing file content as UTF-8', () => {
    const filePath = path.join(tempRoot, 'readable.txt');
    fs.writeFileSync(filePath, 'file content', 'utf8');
    assert.equal(readFileSafe(filePath), 'file content');
  });

  it('returns empty string by default when file does not exist', () => {
    const filePath = path.join(tempRoot, 'nonexistent.txt');
    assert.equal(readFileSafe(filePath), '');
  });

  it('returns custom fallback when file does not exist', () => {
    const filePath = path.join(tempRoot, 'missing.txt');
    assert.equal(readFileSafe(filePath, 'default value'), 'default value');
  });

  it('returns null fallback when explicitly passed', () => {
    const filePath = path.join(tempRoot, 'missing.txt');
    assert.equal(readFileSafe(filePath, null), null);
  });

  it('returns fallback when path is a directory', () => {
    assert.equal(readFileSafe(tempRoot, 'fallback'), 'fallback');
  });

  it('does not throw on any error condition', () => {
    assert.doesNotThrow(() => readFileSafe('/nonexistent/path/file.txt'));
  });

  it('preserves multi-line content', () => {
    const filePath = path.join(tempRoot, 'multiline.txt');
    const content = 'line1\nline2\nline3\n';
    fs.writeFileSync(filePath, content, 'utf8');
    assert.equal(readFileSafe(filePath), content);
  });

  it('preserves unicode content', () => {
    const filePath = path.join(tempRoot, 'unicode.txt');
    const content = 'Hello World';
    fs.writeFileSync(filePath, content, 'utf8');
    assert.equal(readFileSafe(filePath), content);
  });
});

describe('readJsonSafe', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('parses valid JSON from file', () => {
    const filePath = path.join(tempRoot, 'data.json');
    const data = { name: 'maestro', version: 1, nested: { key: 'value' } };
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    assert.deepEqual(readJsonSafe(filePath), data);
  });

  it('returns null by default when file does not exist', () => {
    const filePath = path.join(tempRoot, 'nonexistent.json');
    assert.equal(readJsonSafe(filePath), null);
  });

  it('returns custom fallback when file does not exist', () => {
    const filePath = path.join(tempRoot, 'missing.json');
    const fallback = { default: true };
    assert.deepEqual(readJsonSafe(filePath, fallback), fallback);
  });

  it('returns fallback when file contains invalid JSON', () => {
    const filePath = path.join(tempRoot, 'bad.json');
    fs.writeFileSync(filePath, '{not valid json}', 'utf8');
    assert.deepEqual(readJsonSafe(filePath, { error: true }), { error: true });
  });

  it('returns null fallback for invalid JSON when no fallback specified', () => {
    const filePath = path.join(tempRoot, 'bad.json');
    fs.writeFileSync(filePath, 'not json at all', 'utf8');
    assert.equal(readJsonSafe(filePath), null);
  });

  it('parses JSON arrays', () => {
    const filePath = path.join(tempRoot, 'array.json');
    const data = [1, 'two', { three: 3 }];
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    assert.deepEqual(readJsonSafe(filePath), data);
  });

  it('parses JSON primitives', () => {
    const filePath = path.join(tempRoot, 'primitive.json');
    fs.writeFileSync(filePath, '42', 'utf8');
    assert.equal(readJsonSafe(filePath), 42);
  });

  it('returns fallback when file is empty', () => {
    const filePath = path.join(tempRoot, 'empty.json');
    fs.writeFileSync(filePath, '', 'utf8');
    assert.equal(readJsonSafe(filePath, 'empty'), 'empty');
  });

  it('does not throw on any error condition', () => {
    assert.doesNotThrow(() => readJsonSafe('/nonexistent/path/file.json'));
  });
});

describe('writeIfChanged', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('writes a new file and returns true', () => {
    const filePath = path.join(tempRoot, 'new.txt');
    const result = writeIfChanged(filePath, 'new content');
    assert.equal(result, true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'new content');
  });

  it('returns false when content is identical to existing file', () => {
    const filePath = path.join(tempRoot, 'unchanged.txt');
    fs.writeFileSync(filePath, 'same content', 'utf8');
    const result = writeIfChanged(filePath, 'same content');
    assert.equal(result, false);
  });

  it('does not modify the file when content is identical', () => {
    const filePath = path.join(tempRoot, 'unchanged.txt');
    fs.writeFileSync(filePath, 'same content', 'utf8');
    const mtimeBefore = fs.statSync(filePath).mtimeMs;
    writeIfChanged(filePath, 'same content');
    const mtimeAfter = fs.statSync(filePath).mtimeMs;
    assert.equal(mtimeBefore, mtimeAfter);
  });

  it('writes and returns true when content differs', () => {
    const filePath = path.join(tempRoot, 'changed.txt');
    fs.writeFileSync(filePath, 'old content', 'utf8');
    const result = writeIfChanged(filePath, 'new content');
    assert.equal(result, true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'new content');
  });

  it('creates parent directories for new files', () => {
    const filePath = path.join(tempRoot, 'deep', 'nested', 'file.txt');
    const result = writeIfChanged(filePath, 'deep content');
    assert.equal(result, true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'deep content');
  });

  it('handles empty string content for new file', () => {
    const filePath = path.join(tempRoot, 'empty.txt');
    const result = writeIfChanged(filePath, '');
    assert.equal(result, true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), '');
  });

  it('returns false when existing file and new content are both empty', () => {
    const filePath = path.join(tempRoot, 'both-empty.txt');
    fs.writeFileSync(filePath, '', 'utf8');
    const result = writeIfChanged(filePath, '');
    assert.equal(result, false);
  });

  it('returns boolean type, not truthy/falsy', () => {
    const filePath = path.join(tempRoot, 'type-check.txt');
    const resultNew = writeIfChanged(filePath, 'content');
    assert.equal(typeof resultNew, 'boolean');
    const resultSame = writeIfChanged(filePath, 'content');
    assert.equal(typeof resultSame, 'boolean');
  });
});

describe('ensureDir', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('creates a single directory', () => {
    const dirPath = path.join(tempRoot, 'newdir');
    ensureDir(dirPath);
    assert.ok(fs.statSync(dirPath).isDirectory());
  });

  it('creates nested directories recursively', () => {
    const dirPath = path.join(tempRoot, 'a', 'b', 'c', 'd');
    ensureDir(dirPath);
    assert.ok(fs.statSync(dirPath).isDirectory());
  });

  it('is idempotent on existing directory', () => {
    const dirPath = path.join(tempRoot, 'existing');
    fs.mkdirSync(dirPath);
    assert.doesNotThrow(() => ensureDir(dirPath));
    assert.ok(fs.statSync(dirPath).isDirectory());
  });

  it('does not throw when called multiple times on the same path', () => {
    const dirPath = path.join(tempRoot, 'repeated');
    ensureDir(dirPath);
    assert.doesNotThrow(() => ensureDir(dirPath));
    assert.doesNotThrow(() => ensureDir(dirPath));
  });

  it('creates intermediate directories that do not exist', () => {
    const dirPath = path.join(tempRoot, 'x', 'y', 'z');
    ensureDir(dirPath);
    assert.ok(fs.statSync(path.join(tempRoot, 'x')).isDirectory());
    assert.ok(fs.statSync(path.join(tempRoot, 'x', 'y')).isDirectory());
    assert.ok(fs.statSync(dirPath).isDirectory());
  });
});

describe('module exports', () => {
  it('exports all five documented functions', () => {
    const io = require('../../src/lib/io');
    assert.equal(typeof io.atomicWriteSync, 'function');
    assert.equal(typeof io.readFileSafe, 'function');
    assert.equal(typeof io.readJsonSafe, 'function');
    assert.equal(typeof io.writeIfChanged, 'function');
    assert.equal(typeof io.ensureDir, 'function');
  });

  it('exports exactly five members', () => {
    const io = require('../../src/lib/io');
    assert.equal(Object.keys(io).length, 5);
  });
});
