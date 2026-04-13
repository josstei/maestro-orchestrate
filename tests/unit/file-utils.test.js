'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readFileSafe, readJsonSafe } = require('../../src/core/file-utils');

describe('readFileSafe', () => {
  it('reads an existing file correctly', () => {
    const tmpFile = path.join(os.tmpdir(), `maestro-fu-${Date.now()}-read.txt`);
    fs.writeFileSync(tmpFile, 'hello world', 'utf8');
    try {
      assert.equal(readFileSafe(tmpFile), 'hello world');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns default fallback (empty string) for missing file', () => {
    const result = readFileSafe('/nonexistent/path/missing-file.txt');
    assert.equal(result, '');
  });

  it('returns custom fallback for missing file', () => {
    const result = readFileSafe('/nonexistent/path/missing-file.txt', 'default-value');
    assert.equal(result, 'default-value');
  });

  it('default fallback is empty string', () => {
    const result = readFileSafe('/nonexistent/path/missing-file.txt');
    assert.equal(typeof result, 'string');
    assert.equal(result, '');
  });

  it('works with absolute paths', () => {
    const tmpFile = path.join(os.tmpdir(), `maestro-fu-${Date.now()}-abs.txt`);
    fs.writeFileSync(tmpFile, 'absolute path content', 'utf8');
    try {
      assert.ok(path.isAbsolute(tmpFile));
      assert.equal(readFileSafe(tmpFile), 'absolute path content');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('readJsonSafe', () => {
  it('reads and parses valid JSON file', () => {
    const tmpFile = path.join(os.tmpdir(), `maestro-fu-${Date.now()}-json.json`);
    const data = { name: 'maestro', version: '1.0.0', nested: { key: 'value' } };
    fs.writeFileSync(tmpFile, JSON.stringify(data), 'utf8');
    try {
      assert.deepStrictEqual(readJsonSafe(tmpFile), data);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns default fallback (null) for missing file', () => {
    const result = readJsonSafe('/nonexistent/path/missing-file.json');
    assert.equal(result, null);
  });

  it('returns fallback for invalid JSON content', () => {
    const tmpFile = path.join(os.tmpdir(), `maestro-fu-${Date.now()}-bad.json`);
    fs.writeFileSync(tmpFile, 'not valid json {{{', 'utf8');
    try {
      assert.equal(readJsonSafe(tmpFile), null);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('default fallback is null', () => {
    const result = readJsonSafe('/nonexistent/path/missing-file.json');
    assert.equal(result, null);
  });

  it('returns custom fallback for missing file', () => {
    const fallback = { error: true };
    const result = readJsonSafe('/nonexistent/path/missing-file.json', fallback);
    assert.deepStrictEqual(result, fallback);
  });

  it('returns custom fallback for invalid JSON content', () => {
    const tmpFile = path.join(os.tmpdir(), `maestro-fu-${Date.now()}-badc.json`);
    const fallback = { fallback: true };
    fs.writeFileSync(tmpFile, '{{invalid}}', 'utf8');
    try {
      assert.deepStrictEqual(readJsonSafe(tmpFile, fallback), fallback);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('works with absolute paths', () => {
    const tmpFile = path.join(os.tmpdir(), `maestro-fu-${Date.now()}-absjson.json`);
    fs.writeFileSync(tmpFile, JSON.stringify([1, 2, 3]), 'utf8');
    try {
      assert.ok(path.isAbsolute(tmpFile));
      assert.deepStrictEqual(readJsonSafe(tmpFile), [1, 2, 3]);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
