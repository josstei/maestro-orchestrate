'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parse,
  parseFrontmatterOnly,
  extractValue,
  parseValue,
  parseDoubleQuotedValue,
} = require('../../src/core/frontmatter-parser');

describe('parse', () => {
  it('parses basic key-value pairs from frontmatter', () => {
    const content = '---\nname: my-agent\ntier: full\n---\nBody text here.';
    const result = parse(content);
    assert.deepEqual(result.frontmatter, { name: 'my-agent', tier: 'full' });
    assert.equal(result.body, 'Body text here.');
  });

  it('returns empty frontmatter and full body when no opening delimiter', () => {
    const content = 'No frontmatter here.\nJust plain text.';
    const result = parse(content);
    assert.deepEqual(result.frontmatter, {});
    assert.equal(result.body, content);
  });

  it('returns empty frontmatter and full body when no closing delimiter', () => {
    const content = '---\nname: orphan\nno closing fence';
    const result = parse(content);
    assert.deepEqual(result.frontmatter, {});
    assert.equal(result.body, content);
  });

  it('preserves body content after closing delimiter', () => {
    const content = '---\nkey: value\n---\nLine one.\nLine two.\nLine three.';
    const result = parse(content);
    assert.equal(result.body, 'Line one.\nLine two.\nLine three.');
  });

  it('handles empty frontmatter block', () => {
    const content = '---\n---\nBody only.';
    const result = parse(content);
    assert.deepEqual(result.frontmatter, {});
    assert.equal(result.body, 'Body only.');
  });

  it('skips lines without a colon', () => {
    const content = '---\nname: test\ninvalid line\ntier: read_only\n---\n';
    const result = parse(content);
    assert.deepEqual(result.frontmatter, { name: 'test', tier: 'read_only' });
  });

  it('handles content with no trailing newline after closing delimiter', () => {
    const content = '---\nname: test\n---';
    const result = parse(content);
    assert.deepEqual(result.frontmatter, { name: 'test' });
    assert.equal(result.body, '');
  });

  it('handles values containing colons', () => {
    const content = '---\ndescription: key: value pair inside\n---\n';
    const result = parse(content);
    assert.equal(result.frontmatter.description, 'key: value pair inside');
  });
});

describe('parse — type coercion', () => {
  it('parses inline array values', () => {
    const content = '---\ntools: [read_file, search, edit]\n---\n';
    const result = parse(content);
    assert.deepEqual(result.frontmatter.tools, ['read_file', 'search', 'edit']);
  });

  it('parses empty inline arrays', () => {
    const content = '---\ntools: []\n---\n';
    const result = parse(content);
    assert.deepEqual(result.frontmatter.tools, []);
  });

  it('parses inline arrays with whitespace-only content as empty', () => {
    const content = '---\ntools: [  ]\n---\n';
    const result = parse(content);
    assert.deepEqual(result.frontmatter.tools, []);
  });

  it('parses double-quoted string values', () => {
    const content = '---\nname: "my-agent"\n---\n';
    const result = parse(content);
    assert.equal(result.frontmatter.name, 'my-agent');
  });

  it('parses single-quoted string values', () => {
    const content = "---\nname: 'my-agent'\n---\n";
    const result = parse(content);
    assert.equal(result.frontmatter.name, 'my-agent');
  });

  it('handles escaped single quotes inside single-quoted values', () => {
    const content = "---\nmessage: 'it''s a test'\n---\n";
    const result = parse(content);
    assert.equal(result.frontmatter.message, "it's a test");
  });

  it('coerces numeric values to numbers', () => {
    const content = '---\ntimeout: 30\nretries: 3\n---\n';
    const result = parse(content);
    assert.strictEqual(result.frontmatter.timeout, 30);
    assert.strictEqual(result.frontmatter.retries, 3);
  });

  it('coerces floating-point numeric values', () => {
    const content = '---\nthreshold: 0.85\n---\n';
    const result = parse(content);
    assert.strictEqual(result.frontmatter.threshold, 0.85);
  });

  it('does not coerce non-numeric strings to numbers', () => {
    const content = '---\nname: agent-42\n---\n';
    const result = parse(content);
    assert.strictEqual(result.frontmatter.name, 'agent-42');
  });
});

describe('parseDoubleQuotedValue', () => {
  it('handles \\n escape sequence', () => {
    assert.equal(parseDoubleQuotedValue('line1\\nline2'), 'line1\nline2');
  });

  it('handles \\t escape sequence', () => {
    assert.equal(parseDoubleQuotedValue('col1\\tcol2'), 'col1\tcol2');
  });

  it('handles \\r escape sequence', () => {
    assert.equal(parseDoubleQuotedValue('line1\\rline2'), 'line1\rline2');
  });

  it('handles \\\\ escape sequence', () => {
    assert.equal(parseDoubleQuotedValue('path\\\\to'), 'path\\to');
  });

  it('handles \\" escape sequence', () => {
    assert.equal(parseDoubleQuotedValue('say \\"hello\\"'), 'say "hello"');
  });

  it('preserves unknown escape sequences as backslash + char', () => {
    assert.equal(parseDoubleQuotedValue('test\\x'), 'test\\x');
  });

  it('handles backslash at end of string', () => {
    assert.equal(parseDoubleQuotedValue('trailing\\'), 'trailing\\');
  });

  it('handles multiple escape sequences in one string', () => {
    assert.equal(parseDoubleQuotedValue('a\\nb\\tc\\\\d'), 'a\nb\tc\\d');
  });

  it('handles empty string', () => {
    assert.equal(parseDoubleQuotedValue(''), '');
  });
});

describe('parseValue', () => {
  it('parses inline arrays', () => {
    assert.deepEqual(parseValue('[a, b, c]'), ['a', 'b', 'c']);
  });

  it('parses empty inline arrays', () => {
    assert.deepEqual(parseValue('[]'), []);
  });

  it('parses double-quoted strings with escapes', () => {
    assert.equal(parseValue('"hello\\nworld"'), 'hello\nworld');
  });

  it('parses single-quoted strings', () => {
    assert.equal(parseValue("'hello world'"), 'hello world');
  });

  it('parses integer values', () => {
    assert.strictEqual(parseValue('42'), 42);
  });

  it('parses float values', () => {
    assert.strictEqual(parseValue('3.14'), 3.14);
  });

  it('parses negative numbers', () => {
    assert.strictEqual(parseValue('-7'), -7);
  });

  it('returns bare strings as-is', () => {
    assert.equal(parseValue('hello-world'), 'hello-world');
  });

  it('returns empty string as-is', () => {
    assert.equal(parseValue(''), '');
  });

  it('returns zero for "0"', () => {
    assert.strictEqual(parseValue('0'), 0);
  });
});

describe('parseFrontmatterOnly', () => {
  it('parses key-value pairs as raw strings', () => {
    const content = '---\nname: my-agent\ntimeout: 30\n---\nBody.';
    const result = parseFrontmatterOnly(content);
    assert.deepEqual(result, { name: 'my-agent', timeout: '30' });
  });

  it('does not coerce numeric values', () => {
    const content = '---\ncount: 42\n---\n';
    const result = parseFrontmatterOnly(content);
    assert.strictEqual(result.count, '42');
  });

  it('does not parse inline arrays', () => {
    const content = '---\ntools: [read, write]\n---\n';
    const result = parseFrontmatterOnly(content);
    assert.strictEqual(result.tools, '[read, write]');
  });

  it('returns empty object when no opening delimiter', () => {
    const result = parseFrontmatterOnly('No frontmatter here.');
    assert.deepEqual(result, {});
  });

  it('returns empty object when no closing delimiter with trailing newline', () => {
    const result = parseFrontmatterOnly('---\nname: orphan\nno closing');
    assert.deepEqual(result, {});
  });

  it('requires trailing newline after closing delimiter', () => {
    const result = parseFrontmatterOnly('---\nkey: val\n---');
    assert.deepEqual(result, {});
  });

  it('skips lines without a colon', () => {
    const content = '---\nname: test\ninvalid\ntier: full\n---\n';
    const result = parseFrontmatterOnly(content);
    assert.deepEqual(result, { name: 'test', tier: 'full' });
  });

  it('handles values containing colons', () => {
    const content = '---\ndesc: a: b: c\n---\n';
    const result = parseFrontmatterOnly(content);
    assert.equal(result.desc, 'a: b: c');
  });
});

describe('extractValue', () => {
  it('extracts a value for a given key', () => {
    const content = '---\nname: my-agent\ntier: full\n---\nBody.';
    assert.equal(extractValue(content, 'name'), 'my-agent');
    assert.equal(extractValue(content, 'tier'), 'full');
  });

  it('returns null for a missing key', () => {
    const content = '---\nname: my-agent\n---\n';
    assert.equal(extractValue(content, 'tier'), null);
  });

  it('works without frontmatter delimiters', () => {
    const content = 'name: standalone-value\ntier: read_only';
    assert.equal(extractValue(content, 'name'), 'standalone-value');
    assert.equal(extractValue(content, 'tier'), 'read_only');
  });

  it('trims whitespace from extracted values', () => {
    const content = '---\nname:   spaced-value   \n---\n';
    assert.equal(extractValue(content, 'name'), 'spaced-value');
  });

  it('returns null for empty content', () => {
    assert.equal(extractValue('', 'name'), null);
  });

  it('extracts the first occurrence when key appears multiple times', () => {
    const content = 'name: first\nname: second';
    assert.equal(extractValue(content, 'name'), 'first');
  });
});
