'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { parseEnvFile } = require('../../src/core/env-file-parser');
const { makeTempDir, writeTree } = require('../support/fs');

describe('parseEnvFile', () => {
  let tmpDir;

  before(() => {
    tmpDir = makeTempDir('env-file-parser-');
  });

  function writeFixture(name, content) {
    return writeTree(tmpDir, name, content);
  }

  const cases = [
    ['parses a simple KEY=VALUE pair',
      'simple.env', 'FOO=bar\n', { FOO: 'bar' }],
    ['parses multiple KEY=VALUE pairs',
      'multiple.env', 'A=1\nB=2\nC=3\n', { A: '1', B: '2', C: '3' }],
    ['ignores comment lines starting with #',
      'comments.env', '# This is a comment\nKEY=value\n', { KEY: 'value' }],
    ['strips inline comments after whitespace',
      'inline-comment.env', 'KEY=value # this is a comment\n', { KEY: 'value' }],
    ['preserves # inside double-quoted values',
      'hash-in-double-quotes.env', 'KEY="value#not-a-comment"\n', { KEY: 'value#not-a-comment' }],
    ['preserves # inside single-quoted values',
      'hash-in-single-quotes.env', "KEY='value#not-a-comment'\n", { KEY: 'value#not-a-comment' }],
    ['trims matching double quotes from values',
      'double-quotes.env', 'KEY="hello world"\n', { KEY: 'hello world' }],
    ['trims matching single quotes from values',
      'single-quotes.env', "KEY='hello world'\n", { KEY: 'hello world' }],
    ['does not trim mismatched quotes',
      'mismatched-quotes.env', "KEY='value\"\n", { KEY: "'value\"" }],
    ['handles export prefix',
      'export-prefix.env', 'export KEY=value\n', { KEY: 'value' }],
    ['parses multi-line double-quoted values',
      'multi-line.env', 'KEY="line one\nline two\nline three"\n', { KEY: 'line one\nline two\nline three' }],
    ['handles empty file',
      'empty.env', '', {}],
    ['skips blank lines',
      'blank-lines.env', '\n\nKEY=value\n\n', { KEY: 'value' }],
    ['skips lines without an = sign',
      'no-equals.env', 'NOTAVALIDLINE\nKEY=value\n', { KEY: 'value' }],
    ['handles KEY= with empty value',
      'empty-value.env', 'KEY=\n', { KEY: '' }],
    ['handles values with = in them using only the first = as separator',
      'equals-in-value.env', 'KEY=a=b=c\n', { KEY: 'a=b=c' }],
  ];
  for (const [title, filename, content, expected] of cases) {
    it(title, () => {
      const filePath = writeFixture(filename, content);
      assert.deepEqual(parseEnvFile(filePath), expected);
    });
  }

  it('handles unclosed multi-line quotes by logging a warning and returning accumulated value', (t) => {
    t.mock.method(console, 'warn');
    const filePath = writeFixture('unclosed-quote.env', 'KEY="line one\nline two\n');
    const result = parseEnvFile(filePath);
    assert.equal(result.KEY, 'line one\nline two\n');
    assert.equal(console.warn.mock.calls.length, 1);
    assert.ok(console.warn.mock.calls[0].arguments[0].includes('unclosed quote'));
  });

  it('can collect diagnostics without changing parsed values or writing to stderr', (t) => {
    t.mock.method(console, 'warn', () => {});
    const warnings = [];
    const filePath = writeFixture('captured-quote.env', 'KEY="line one\nline two\n');
    assert.deepEqual(parseEnvFile(filePath, { onWarning: (message) => warnings.push(message) }), {
      KEY: 'line one\nline two\n',
    });
    assert.deepEqual(warnings, [
      'env-file-parser: unclosed quote for key "KEY", treating accumulated content as value',
    ]);
    assert.equal(console.warn.mock.calls.length, 0);
  });

  it('returns empty object for non-existent file path', () => {
    const result = parseEnvFile(path.join(tmpDir, 'does-not-exist.env'));
    assert.deepEqual(result, {});
  });

});
