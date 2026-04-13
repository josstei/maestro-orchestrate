'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  parse,
  parseFrontmatterOnly,
  extractValue,
  escapeYaml,
  splitAtBoundary,
  parseValue,
  parseDoubleQuotedValue,
} = require('../../src/lib/frontmatter');

const coreFrontmatter = require('../../src/core/frontmatter-parser');

const AGENTS_DIR = path.join(__dirname, '..', '..', 'src', 'agents');

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

  it('handles string with only a backslash', () => {
    assert.equal(parseDoubleQuotedValue('\\'), '\\');
  });

  it('handles consecutive escape sequences', () => {
    assert.equal(parseDoubleQuotedValue('\\n\\n\\n'), '\n\n\n');
  });
});

describe('parseValue', () => {
  it('parses inline arrays', () => {
    assert.deepEqual(parseValue('[a, b, c]'), ['a', 'b', 'c']);
  });

  it('parses empty inline arrays', () => {
    assert.deepEqual(parseValue('[]'), []);
  });

  it('parses inline arrays with whitespace-only content as empty', () => {
    assert.deepEqual(parseValue('[  ]'), []);
  });

  it('parses double-quoted strings with escapes', () => {
    assert.equal(parseValue('"hello\\nworld"'), 'hello\nworld');
  });

  it('parses single-quoted strings', () => {
    assert.equal(parseValue("'hello world'"), 'hello world');
  });

  it('handles escaped single quotes inside single-quoted values', () => {
    assert.equal(parseValue("'it''s a test'"), "it's a test");
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
  it('escapes backslashes', () => {
    assert.equal(escapeYaml('path\\to\\file'), 'path\\\\to\\\\file');
  });

  it('escapes double quotes', () => {
    assert.equal(escapeYaml('say "hello"'), 'say \\"hello\\"');
  });

  it('escapes both backslashes and quotes', () => {
    assert.equal(escapeYaml('a\\"b'), 'a\\\\\\"b');
  });

  it('returns unchanged string when no special characters', () => {
    assert.equal(escapeYaml('simple value'), 'simple value');
  });

  it('handles empty string', () => {
    assert.equal(escapeYaml(''), '');
  });

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

describe('Parity: parse() vs core/frontmatter-parser parse()', () => {
  const agentFiles = fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(AGENTS_DIR, f));

  assert.ok(agentFiles.length > 0, 'Expected at least one agent file');

  for (const filePath of agentFiles) {
    const fileName = path.basename(filePath);

    it(`produces identical output for ${fileName}`, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      const expected = coreFrontmatter.parse(content);
      const actual = parse(content);
      assert.deepEqual(actual.frontmatter, expected.frontmatter);
      assert.equal(actual.body, expected.body);
    });
  }
});

describe('Parity: parseFrontmatterOnly() vs core/frontmatter-parser parseFrontmatterOnly()', () => {
  const agentFiles = fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(AGENTS_DIR, f));

  for (const filePath of agentFiles) {
    const fileName = path.basename(filePath);

    it(`produces identical frontmatter for ${fileName}`, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      const expectedFm = coreFrontmatter.parseFrontmatterOnly(content);
      const actual = parseFrontmatterOnly(content);
      assert.deepEqual(actual.frontmatter, expectedFm);
    });
  }
});

describe('Parity: extractValue() vs core/frontmatter-parser extractValue()', () => {
  const agentFiles = fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(AGENTS_DIR, f));

  const keysToTest = ['name', 'description', 'capabilities', 'color', 'max_turns', 'temperature'];

  for (const filePath of agentFiles) {
    const fileName = path.basename(filePath);

    for (const key of keysToTest) {
      it(`extracts "${key}" identically for ${fileName}`, () => {
        const content = fs.readFileSync(filePath, 'utf8');
        const expected = coreFrontmatter.extractValue(content, key);
        const actual = extractValue(content, key);
        assert.equal(actual, expected);
      });
    }
  }
});

describe('Parity: escapeYaml round-trip with parseDoubleQuotedValue', () => {
  const agentFiles = fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(AGENTS_DIR, f));

  for (const filePath of agentFiles) {
    const fileName = path.basename(filePath);

    it(`round-trips description for ${fileName}`, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      const fm = coreFrontmatter.parseFrontmatterOnly(content);
      if (fm.description) {
        let desc = fm.description;
        if (desc.startsWith('"') && desc.endsWith('"')) {
          desc = coreFrontmatter.parseDoubleQuotedValue(desc.slice(1, -1));
        }
        const escaped = escapeYaml(desc);
        const restored = parseDoubleQuotedValue(escaped);
        assert.equal(restored, desc, `round-trip failed for description in ${fileName}`);
      }
    });
  }
});
