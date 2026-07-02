'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parse,
  parseFrontmatterOnly,
  extractValue,
  escapeYaml,
  splitAtBoundary,
  parseValue,
  parseDoubleQuotedValue,
} = require('../../src/lib/frontmatter');

describe('parseDoubleQuotedValue', () => {
  const cases = [
    ['handles \\n escape sequence', 'line1\\nline2', 'line1\nline2'],
    ['handles \\t escape sequence', 'col1\\tcol2', 'col1\tcol2'],
    ['handles \\r escape sequence', 'line1\\rline2', 'line1\rline2'],
    ['handles \\\\ escape sequence', 'path\\\\to', 'path\\to'],
    ['handles \\" escape sequence', 'say \\"hello\\"', 'say "hello"'],
    ['preserves unknown escape sequences as backslash + char', 'test\\x', 'test\\x'],
    ['handles backslash at end of string', 'trailing\\', 'trailing\\'],
    ['handles multiple escape sequences in one string', 'a\\nb\\tc\\\\d', 'a\nb\tc\\d'],
    ['handles empty string', '', ''],
    ['handles string with only a backslash', '\\', '\\'],
    ['handles consecutive escape sequences', '\\n\\n\\n', '\n\n\n'],
  ];

  for (const [name, input, expected] of cases) {
    it(name, () => {
      assert.equal(parseDoubleQuotedValue(input), expected);
    });
  }
});

describe('parseValue', () => {
  const cases = [
    ['parses inline arrays', '[a, b, c]', ['a', 'b', 'c'], 'deepEqual'],
    ['parses empty inline arrays', '[]', [], 'deepEqual'],
    ['parses inline arrays with whitespace-only content as empty', '[  ]', [], 'deepEqual'],
    ['parses double-quoted strings with escapes', '"hello\\nworld"', 'hello\nworld', 'equal'],
    ['parses single-quoted strings', "'hello world'", 'hello world', 'equal'],
    ["handles escaped single quotes inside single-quoted values", "'it''s a test'", "it's a test", 'equal'],
    ['parses integer values', '42', 42, 'strictEqual'],
    ['parses float values', '3.14', 3.14, 'strictEqual'],
    ['parses negative numbers', '-7', -7, 'strictEqual'],
    ['returns bare strings as-is', 'hello-world', 'hello-world', 'equal'],
    ['returns empty string as-is', '', '', 'equal'],
    ['returns zero for "0"', '0', 0, 'strictEqual'],
  ];

  for (const [name, input, expected, kind] of cases) {
    it(name, () => {
      assert[kind](parseValue(input), expected);
    });
  }
});

describe('splitAtBoundary', () => {
  it('splits content with valid frontmatter', () => {
    const content = '---\nname: test\ntier: full\n---\nBody text.';
    const result = splitAtBoundary(content);
    assert.equal(result.raw, 'name: test\ntier: full');
    assert.equal(result.body, 'Body text.');
  });

  it('returns empty raw and full content as body when no opening delimiter', () => {
    const content = 'No frontmatter here.';
    const result = splitAtBoundary(content);
    assert.equal(result.raw, '');
    assert.equal(result.body, content);
  });

  it('returns empty raw and full content as body when no closing delimiter', () => {
    const content = '---\nname: orphan\nno closing';
    const result = splitAtBoundary(content);
    assert.equal(result.raw, '');
    assert.equal(result.body, content);
  });

  it('handles empty frontmatter block', () => {
    const content = '---\n---\nBody only.';
    const result = splitAtBoundary(content);
    assert.equal(result.raw, '');
    assert.equal(result.body, 'Body only.');
  });

  it('handles content with no trailing newline after closing delimiter', () => {
    const content = '---\nname: test\n---';
    const result = splitAtBoundary(content);
    assert.equal(result.raw, 'name: test');
    assert.equal(result.body, '');
  });

  it('handles empty frontmatter with no body', () => {
    const content = '---\n---';
    const result = splitAtBoundary(content);
    assert.equal(result.raw, '');
    assert.equal(result.body, '');
  });

  it('handles multiline body after frontmatter', () => {
    const content = '---\nkey: val\n---\nLine 1\nLine 2\nLine 3';
    const result = splitAtBoundary(content);
    assert.equal(result.raw, 'key: val');
    assert.equal(result.body, 'Line 1\nLine 2\nLine 3');
  });

  it('does not treat --- inside body as delimiter', () => {
    const content = '---\nname: test\n---\nBody with ---\nin it.';
    const result = splitAtBoundary(content);
    assert.equal(result.raw, 'name: test');
    assert.equal(result.body, 'Body with ---\nin it.');
  });

  it('handles frontmatter with empty value lines', () => {
    const content = '---\nname:\ndescription:\n---\nBody.';
    const result = splitAtBoundary(content);
    assert.equal(result.raw, 'name:\ndescription:');
    assert.equal(result.body, 'Body.');
  });

  it('returns full content as body for empty string', () => {
    const result = splitAtBoundary('');
    assert.equal(result.raw, '');
    assert.equal(result.body, '');
  });

  it('handles --- not on the first line', () => {
    const content = 'preamble\n---\nkey: val\n---\nBody.';
    const result = splitAtBoundary(content);
    assert.equal(result.raw, '');
    assert.equal(result.body, content);
  });
});

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

describe('parseFrontmatterOnly', () => {
  it('parses key-value pairs as raw strings with body', () => {
    const content = '---\nname: my-agent\ntimeout: 30\n---\nBody.';
    const result = parseFrontmatterOnly(content);
    assert.deepEqual(result.frontmatter, { name: 'my-agent', timeout: '30' });
    assert.equal(result.body, 'Body.');
  });

  it('does not coerce numeric values', () => {
    const content = '---\ncount: 42\n---\n';
    const result = parseFrontmatterOnly(content);
    assert.strictEqual(result.frontmatter.count, '42');
  });

  it('does not parse inline arrays', () => {
    const content = '---\ntools: [read, write]\n---\n';
    const result = parseFrontmatterOnly(content);
    assert.strictEqual(result.frontmatter.tools, '[read, write]');
  });

  it('returns empty frontmatter and full body when no opening delimiter', () => {
    const content = 'No frontmatter here.';
    const result = parseFrontmatterOnly(content);
    assert.deepEqual(result.frontmatter, {});
    assert.equal(result.body, content);
  });

  it('returns empty frontmatter and full body when no closing delimiter', () => {
    const content = '---\nname: orphan\nno closing';
    const result = parseFrontmatterOnly(content);
    assert.deepEqual(result.frontmatter, {});
    assert.equal(result.body, content);
  });

  it('returns empty frontmatter and full body when no trailing newline after closing delimiter', () => {
    const content = '---\nkey: val\n---';
    const result = parseFrontmatterOnly(content);
    assert.deepEqual(result.frontmatter, {});
    assert.equal(result.body, content);
  });

  it('skips lines without a colon', () => {
    const content = '---\nname: test\ninvalid\ntier: full\n---\n';
    const result = parseFrontmatterOnly(content);
    assert.deepEqual(result.frontmatter, { name: 'test', tier: 'full' });
  });

  it('handles values containing colons', () => {
    const content = '---\ndesc: a: b: c\n---\n';
    const result = parseFrontmatterOnly(content);
    assert.equal(result.frontmatter.desc, 'a: b: c');
  });

  it('returns empty body string when body is empty after frontmatter', () => {
    const content = '---\nkey: val\n---\n';
    const result = parseFrontmatterOnly(content);
    assert.deepEqual(result.frontmatter, { key: 'val' });
    assert.equal(result.body, '');
  });

  it('preserves multiline body', () => {
    const content = '---\nkey: val\n---\nLine 1\nLine 2';
    const result = parseFrontmatterOnly(content);
    assert.equal(result.body, 'Line 1\nLine 2');
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

describe('escapeYaml', () => {
  const cases = [
    ['escapes backslashes', 'path\\to\\file', 'path\\\\to\\\\file'],
    ['escapes double quotes', 'say "hello"', 'say \\"hello\\"'],
    ['escapes both backslashes and quotes', 'a\\"b', 'a\\\\\\"b'],
    ['returns unchanged string when no special characters', 'simple value', 'simple value'],
    ['handles empty string', '', ''],
  ];

  for (const [name, input, expected] of cases) {
    it(name, () => {
      assert.equal(escapeYaml(input), expected);
    });
  }

  it('coerces non-string input via String()', () => {
    assert.equal(escapeYaml(42), '42');
    assert.equal(escapeYaml(null), 'null');
    assert.equal(escapeYaml(undefined), 'undefined');
    assert.equal(escapeYaml(true), 'true');
  });

  it('round-trips with parseDoubleQuotedValue', () => {
    const values = [
      'simple',
      'with "quotes"',
      'with \\backslash',
      'mixed "quotes" and \\slashes',
      '',
    ];
    for (const original of values) {
      const escaped = escapeYaml(original);
      const restored = parseDoubleQuotedValue(escaped);
      assert.equal(restored, original, `round-trip failed for: ${JSON.stringify(original)}`);
    }
  });
});

