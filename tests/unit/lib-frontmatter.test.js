'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parse, escapeYaml } = require('../../src/lib/frontmatter');

/** Parse `raw` as the inner text of a double-quoted frontmatter value. */
const valueOf = (raw) => parse(`---\nk: "${raw}"\n---\n`).frontmatter.k;

describe('parse double-quoted values', () => {
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

  for (const [title, raw, expected] of cases) {
    it(title, () => {
      assert.equal(valueOf(raw), expected);
    });
  }
});

describe('parse frontmatter boundaries', () => {
  const cases = [
    ['ignores an opening delimiter that is never closed', '---\nname: orphan\nno closing', {}, null],
    ['handles an empty frontmatter block', '---\n---\nBody only.', {}, 'Body only.'],
    ['handles an empty frontmatter block with no body', '---\n---', {}, ''],
    ['does not treat --- inside the body as a delimiter', '---\nname: test\n---\nBody with ---\nin it.', { name: 'test' }, 'Body with ---\nin it.'],
    ['requires the opening --- on the first line', 'preamble\n---\nkey: val\n---\nBody.', {}, null],
    ['returns empty frontmatter and body for an empty string', '', {}, ''],
    ['parses keys with empty values as empty strings', '---\nname:\ndescription:\n---\nBody.', { name: '', description: '' }, 'Body.'],
  ];

  for (const [title, content, frontmatter, body] of cases) {
    it(title, () => {
      // A null body means the whole content is the body.
      assert.deepEqual(parse(content), { frontmatter, body: body === null ? content : body });
    });
  }
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

  it('preserves body content after closing delimiter', () => {
    const content = '---\nkey: value\n---\nLine one.\nLine two.\nLine three.';
    const result = parse(content);
    assert.equal(result.body, 'Line one.\nLine two.\nLine three.');
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
    assert.equal(result.frontmatter.timeout, 30);
    assert.equal(result.frontmatter.retries, 3);
  });

  it('coerces floating-point numeric values', () => {
    const content = '---\nthreshold: 0.85\n---\n';
    const result = parse(content);
    assert.equal(result.frontmatter.threshold, 0.85);
  });

  it('does not coerce non-numeric strings to numbers', () => {
    const content = '---\nname: agent-42\n---\n';
    const result = parse(content);
    assert.equal(result.frontmatter.name, 'agent-42');
  });

  it('coerces negative numbers and zero', () => {
    const content = '---\noffset: -7\ncount: 0\n---\n';
    const result = parse(content);
    assert.equal(result.frontmatter.offset, -7);
    assert.equal(result.frontmatter.count, 0);
  });

  it('keeps an empty value as an empty string', () => {
    const content = '---\nname:\n---\n';
    const result = parse(content);
    assert.equal(result.frontmatter.name, '');
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

  it('round-trips through a parsed double-quoted value', () => {
    const values = [
      'simple',
      'with "quotes"',
      'with \\backslash',
      'mixed "quotes" and \\slashes',
      '',
    ];
    for (const original of values) {
      const escaped = escapeYaml(original);
      const restored = valueOf(escaped);
      assert.equal(restored, original, `round-trip failed for: ${JSON.stringify(original)}`);
    }
  });
});

