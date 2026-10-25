'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parse,
  splitAtBoundary,
} = require('../../src/lib/frontmatter');

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

describe('splitAtBoundary', () => {
  const cases = [
    ['splits content with valid frontmatter',
      '---\nname: test\ntier: full\n---\nBody text.', 'name: test\ntier: full', 'Body text.'],
    ['returns empty raw and full content as body when no opening delimiter',
      'No frontmatter here.', '', 'No frontmatter here.'],
    ['returns empty raw and full content as body when no closing delimiter',
      '---\nname: orphan\nno closing', '', '---\nname: orphan\nno closing'],
    ['handles empty frontmatter block',
      '---\n---\nBody only.', '', 'Body only.'],
    ['handles content with no trailing newline after closing delimiter',
      '---\nname: test\n---', 'name: test', ''],
    ['handles empty frontmatter with no body',
      '---\n---', '', ''],
    ['handles multiline body after frontmatter',
      '---\nkey: val\n---\nLine 1\nLine 2\nLine 3', 'key: val', 'Line 1\nLine 2\nLine 3'],
    ['does not treat --- inside body as delimiter',
      '---\nname: test\n---\nBody with ---\nin it.', 'name: test', 'Body with ---\nin it.'],
    ['handles frontmatter with empty value lines',
      '---\nname:\ndescription:\n---\nBody.', 'name:\ndescription:', 'Body.'],
    ['returns full content as body for empty string',
      '', '', ''],
    ['handles --- not on the first line',
      'preamble\n---\nkey: val\n---\nBody.', '', 'preamble\n---\nkey: val\n---\nBody.'],
    ['splits CRLF content into LF raw and body',
      '---\r\nname: test\r\ntier: full\r\n---\r\nLine 1\r\nLine 2\r\n', 'name: test\ntier: full', 'Line 1\nLine 2\n'],
    ['returns CRLF content without frontmatter as an LF body',
      'Line 1\r\nLine 2\r\n', '', 'Line 1\nLine 2\n'],
  ];
  for (const [title, content, raw, body] of cases) {
    it(title, () => {
      const result = splitAtBoundary(content);
      assert.equal(result.raw, raw);
      assert.equal(result.body, body);
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

  for (const [title, content, key, expected] of [
    ['handles values containing colons',
      '---\ndescription: key: value pair inside\n---\n', 'description', 'key: value pair inside'],
    ['parses double-quoted string values',
      '---\nname: "my-agent"\n---\n', 'name', 'my-agent'],
    ['parses single-quoted string values',
      "---\nname: 'my-agent'\n---\n", 'name', 'my-agent'],
    ['handles escaped single quotes inside single-quoted values',
      "---\nmessage: 'it''s a test'\n---\n", 'message', "it's a test"],
    ['coerces floating-point numeric values',
      '---\nthreshold: 0.85\n---\n', 'threshold', 0.85],
    ['does not coerce non-numeric strings to numbers',
      '---\nname: agent-42\n---\n', 'name', 'agent-42'],
    ['keeps an empty value as an empty string',
      '---\nname:\n---\n', 'name', ''],
  ]) {
    it(title, () => {
      const result = parse(content);
      assert.equal(result.frontmatter[key], expected);
    });
  }

  for (const [title, content, key, expected] of [
    ['parses inline array values',
      '---\ntools: [read_file, search, edit]\n---\n', 'tools', ['read_file', 'search', 'edit']],
    ['parses empty inline arrays',
      '---\ntools: []\n---\n', 'tools', []],
    ['parses inline arrays with whitespace-only content as empty',
      '---\ntools: [  ]\n---\n', 'tools', []],
  ]) {
    it(title, () => {
      const result = parse(content);
      assert.deepEqual(result.frontmatter[key], expected);
    });
  }

  it('coerces numeric values to numbers', () => {
    const content = '---\ntimeout: 30\nretries: 3\n---\n';
    const result = parse(content);
    assert.equal(result.frontmatter.timeout, 30);
    assert.equal(result.frontmatter.retries, 3);
  });

  it('parses CRLF content like LF content', () => {
    const content = '---\r\nname: test\r\ntools: [read_file, glob]\r\nmax_turns: 5\r\n---\r\nBody.\r\n';
    assert.deepEqual(parse(content), {
      frontmatter: { name: 'test', tools: ['read_file', 'glob'], max_turns: 5 },
      body: 'Body.\n',
    });
  });

  it('coerces negative numbers and zero', () => {
    const content = '---\noffset: -7\ncount: 0\n---\n';
    const result = parse(content);
    assert.equal(result.frontmatter.offset, -7);
    assert.equal(result.frontmatter.count, 0);
  });

});
