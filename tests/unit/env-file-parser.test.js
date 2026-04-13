'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseEnvFile } = require('../../src/core/env-file-parser');

describe('parseEnvFile', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-file-parser-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  function writeFixture(name, content) {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  it('parses a simple KEY=VALUE pair', () => {
    const filePath = writeFixture('simple.env', 'FOO=bar\n');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { FOO: 'bar' });
  });

  it('parses multiple KEY=VALUE pairs', () => {
    const filePath = writeFixture('multiple.env', 'A=1\nB=2\nC=3\n');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { A: '1', B: '2', C: '3' });
  });

  it('ignores comment lines starting with #', () => {
    const filePath = writeFixture('comments.env', '# This is a comment\nKEY=value\n');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: 'value' });
  });

  it('strips inline comments after whitespace', () => {
    const filePath = writeFixture('inline-comment.env', 'KEY=value # this is a comment\n');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: 'value' });
  });

  it('preserves # inside double-quoted values', () => {
    const filePath = writeFixture('hash-in-double-quotes.env', 'KEY="value#not-a-comment"\n');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: 'value#not-a-comment' });
  });

  it('preserves # inside single-quoted values', () => {
    const filePath = writeFixture('hash-in-single-quotes.env', "KEY='value#not-a-comment'\n");
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: 'value#not-a-comment' });
  });

  it('trims matching double quotes from values', () => {
    const filePath = writeFixture('double-quotes.env', 'KEY="hello world"\n');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: 'hello world' });
  });

  it('trims matching single quotes from values', () => {
    const filePath = writeFixture('single-quotes.env', "KEY='hello world'\n");
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: 'hello world' });
  });

  it('does not trim mismatched quotes', () => {
    const filePath = writeFixture('mismatched-quotes.env', "KEY='value\"\n");
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: "'value\"" });
  });

  it('handles export prefix', () => {
    const filePath = writeFixture('export-prefix.env', 'export KEY=value\n');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: 'value' });
  });

  it('parses multi-line double-quoted values', () => {
    const content = 'KEY="line one\nline two\nline three"\n';
    const filePath = writeFixture('multi-line.env', content);
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: 'line one\nline two\nline three' });
  });

  it('handles unclosed multi-line quotes by logging a warning and returning accumulated value', (t) => {
    t.mock.method(console, 'warn');
    const filePath = writeFixture('unclosed-quote.env', 'KEY="line one\nline two\n');
    const result = parseEnvFile(filePath);
    assert.equal(result.KEY, 'line one\nline two\n');
    assert.equal(console.warn.mock.calls.length, 1);
    assert.ok(console.warn.mock.calls[0].arguments[0].includes('unclosed quote'));
  });

  it('returns empty object for non-existent file path', () => {
    const result = parseEnvFile(path.join(tmpDir, 'does-not-exist.env'));
    assert.deepEqual(result, {});
  });

  it('handles empty file', () => {
    const filePath = writeFixture('empty.env', '');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, {});
  });

  it('skips blank lines', () => {
    const filePath = writeFixture('blank-lines.env', '\n\nKEY=value\n\n');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: 'value' });
  });

  it('skips lines without an = sign', () => {
    const filePath = writeFixture('no-equals.env', 'NOTAVALIDLINE\nKEY=value\n');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: 'value' });
  });

  it('handles KEY= with empty value', () => {
    const filePath = writeFixture('empty-value.env', 'KEY=\n');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: '' });
  });

  it('handles values with = in them using only the first = as separator', () => {
    const filePath = writeFixture('equals-in-value.env', 'KEY=a=b=c\n');
    const result = parseEnvFile(filePath);
    assert.deepEqual(result, { KEY: 'a=b=c' });
  });
});
