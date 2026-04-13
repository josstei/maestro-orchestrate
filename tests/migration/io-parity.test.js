'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const coreAtomicWrite = require('../../src/core/atomic-write');
const coreFileUtils = require('../../src/core/file-utils');
const libIo = require('../../src/lib/io');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-io-parity-'));

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('io-parity: atomicWriteSync()', () => {
  it('produces identical file content for a simple string', () => {
    const content = 'Hello, world!\nLine two.\n';
    const oldPath = path.join(tmpDir, 'atomic-old-simple.txt');
    const newPath = path.join(tmpDir, 'atomic-new-simple.txt');

    coreAtomicWrite.atomicWriteSync(oldPath, content);
    libIo.atomicWriteSync(newPath, content);

    const oldResult = fs.readFileSync(oldPath, 'utf8');
    const newResult = fs.readFileSync(newPath, 'utf8');
    assert.strictEqual(newResult, oldResult);
  });

  it('produces identical file content for empty string', () => {
    const content = '';
    const oldPath = path.join(tmpDir, 'atomic-old-empty.txt');
    const newPath = path.join(tmpDir, 'atomic-new-empty.txt');

    coreAtomicWrite.atomicWriteSync(oldPath, content);
    libIo.atomicWriteSync(newPath, content);

    const oldResult = fs.readFileSync(oldPath, 'utf8');
    const newResult = fs.readFileSync(newPath, 'utf8');
    assert.strictEqual(newResult, oldResult);
  });

  it('produces identical file content for multiline JSON', () => {
    const content = JSON.stringify({ key: 'value', nested: [1, 2, 3] }, null, 2) + '\n';
    const oldPath = path.join(tmpDir, 'atomic-old-json.txt');
    const newPath = path.join(tmpDir, 'atomic-new-json.txt');

    coreAtomicWrite.atomicWriteSync(oldPath, content);
    libIo.atomicWriteSync(newPath, content);

    const oldResult = fs.readFileSync(oldPath, 'utf8');
    const newResult = fs.readFileSync(newPath, 'utf8');
    assert.strictEqual(newResult, oldResult);
  });

  it('creates nested parent directories identically', () => {
    const content = 'nested content';
    const oldPath = path.join(tmpDir, 'atomic-nest-old', 'deep', 'file.txt');
    const newPath = path.join(tmpDir, 'atomic-nest-new', 'deep', 'file.txt');

    coreAtomicWrite.atomicWriteSync(oldPath, content);
    libIo.atomicWriteSync(newPath, content);

    const oldResult = fs.readFileSync(oldPath, 'utf8');
    const newResult = fs.readFileSync(newPath, 'utf8');
    assert.strictEqual(newResult, oldResult);
  });

  it('overwrites existing file identically', () => {
    const initial = 'initial content';
    const updated = 'updated content';
    const oldPath = path.join(tmpDir, 'atomic-overwrite-old.txt');
    const newPath = path.join(tmpDir, 'atomic-overwrite-new.txt');

    coreAtomicWrite.atomicWriteSync(oldPath, initial);
    libIo.atomicWriteSync(newPath, initial);

    coreAtomicWrite.atomicWriteSync(oldPath, updated);
    libIo.atomicWriteSync(newPath, updated);

    const oldResult = fs.readFileSync(oldPath, 'utf8');
    const newResult = fs.readFileSync(newPath, 'utf8');
    assert.strictEqual(newResult, oldResult);
  });
});

describe('io-parity: readFileSafe()', () => {
  it('returns identical content for an existing file', () => {
    const filePath = path.join(tmpDir, 'readable.txt');
    fs.writeFileSync(filePath, 'file content here', 'utf8');

    const expected = coreFileUtils.readFileSafe(filePath);
    const actual = libIo.readFileSafe(filePath);
    assert.strictEqual(actual, expected);
  });

  it('returns identical default fallback for a missing file', () => {
    const missing = path.join(tmpDir, 'nonexistent-read.txt');

    const expected = coreFileUtils.readFileSafe(missing);
    const actual = libIo.readFileSafe(missing);
    assert.strictEqual(actual, expected);
  });

  it('returns identical custom fallback for a missing file', () => {
    const missing = path.join(tmpDir, 'nonexistent-read-fallback.txt');

    const expected = coreFileUtils.readFileSafe(missing, 'custom-fallback');
    const actual = libIo.readFileSafe(missing, 'custom-fallback');
    assert.strictEqual(actual, expected);
  });

  it('returns identical content for an empty file', () => {
    const filePath = path.join(tmpDir, 'empty-readable.txt');
    fs.writeFileSync(filePath, '', 'utf8');

    const expected = coreFileUtils.readFileSafe(filePath);
    const actual = libIo.readFileSafe(filePath);
    assert.strictEqual(actual, expected);
  });
});

describe('io-parity: readJsonSafe()', () => {
  it('returns identical parsed object for valid JSON', () => {
    const filePath = path.join(tmpDir, 'valid.json');
    fs.writeFileSync(filePath, '{"key":"value","num":42}', 'utf8');

    const expected = coreFileUtils.readJsonSafe(filePath);
    const actual = libIo.readJsonSafe(filePath);
    assert.deepStrictEqual(actual, expected);
  });

  it('returns identical parsed array for valid JSON array', () => {
    const filePath = path.join(tmpDir, 'valid-array.json');
    fs.writeFileSync(filePath, '[1, 2, 3]', 'utf8');

    const expected = coreFileUtils.readJsonSafe(filePath);
    const actual = libIo.readJsonSafe(filePath);
    assert.deepStrictEqual(actual, expected);
  });

  it('returns identical default fallback for invalid JSON', () => {
    const filePath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(filePath, '{not valid json', 'utf8');

    const expected = coreFileUtils.readJsonSafe(filePath);
    const actual = libIo.readJsonSafe(filePath);
    assert.strictEqual(actual, expected);
  });

  it('returns identical default fallback for missing file', () => {
    const missing = path.join(tmpDir, 'nonexistent.json');

    const expected = coreFileUtils.readJsonSafe(missing);
    const actual = libIo.readJsonSafe(missing);
    assert.strictEqual(actual, expected);
  });

  it('returns identical custom fallback for missing file', () => {
    const missing = path.join(tmpDir, 'nonexistent-fallback.json');

    const expected = coreFileUtils.readJsonSafe(missing, { fallback: true });
    const actual = libIo.readJsonSafe(missing, { fallback: true });
    assert.deepStrictEqual(actual, expected);
  });

  it('returns identical result for empty file', () => {
    const filePath = path.join(tmpDir, 'empty.json');
    fs.writeFileSync(filePath, '', 'utf8');

    const expected = coreFileUtils.readJsonSafe(filePath);
    const actual = libIo.readJsonSafe(filePath);
    assert.strictEqual(actual, expected);
  });
});
