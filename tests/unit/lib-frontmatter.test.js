'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parse } = require('../../src/lib/frontmatter');

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

describe('parse', () => {
  const cases = [
    ['splits content with valid frontmatter',
      '---\nname: test\ntier: full\n---\nBody text.', { name: 'test', tier: 'full' }, 'Body text.'],
    ['returns empty frontmatter and full content as body when no opening delimiter',
      'No frontmatter here.\nJust plain text.', {}, 'No frontmatter here.\nJust plain text.'],
    ['returns empty frontmatter and full content as body when no closing delimiter',
      '---\nname: orphan\nno closing', {}, '---\nname: orphan\nno closing'],
    ['handles empty frontmatter block',
      '---\n---\nBody only.', {}, 'Body only.'],
    ['handles content with no trailing newline after closing delimiter',
      '---\nname: test\n---', { name: 'test' }, ''],
    ['handles empty frontmatter with no body',
      '---\n---', {}, ''],
    ['handles multiline body after frontmatter',
      '---\nkey: val\n---\nLine 1\nLine 2\nLine 3', { key: 'val' }, 'Line 1\nLine 2\nLine 3'],
    ['does not treat --- inside body as delimiter',
      '---\nname: test\n---\nBody with ---\nin it.', { name: 'test' }, 'Body with ---\nin it.'],
    ['skips lines without a colon and trims keys',
      '---\nname: test\ninvalid line\n  tier : read_only\n---\n', { name: 'test', tier: 'read_only' }, ''],
    ['keeps empty values as empty strings',
      '---\nname:\ndescription:\n---\nBody.', { name: '', description: '' }, 'Body.'],
    ['returns full content as body for empty string',
      '', {}, ''],
    ['handles --- not on the first line',
      'preamble\n---\nkey: val\n---\nBody.', {}, 'preamble\n---\nkey: val\n---\nBody.'],
    ['splits CRLF content into LF frontmatter and body',
      '---\r\nname: test\r\ntier: full\r\n---\r\nLine 1\r\nLine 2\r\n',
      { name: 'test', tier: 'full' }, 'Line 1\nLine 2\n'],
    ['returns CRLF content without frontmatter as an LF body',
      'Line 1\r\nLine 2\r\n', {}, 'Line 1\nLine 2\n'],
    ['handles values containing colons',
      '---\ndescription: key: value pair inside\n---\n', { description: 'key: value pair inside' }, ''],
    ['parses double- and single-quoted string values',
      "---\nname: \"my-agent\"\nalias: 'my-agent'\nmessage: 'it''s a test'\n---\n",
      { name: 'my-agent', alias: 'my-agent', message: "it's a test" }, ''],
    ['coerces numeric values and leaves non-numeric strings alone',
      '---\ntimeout: 30\nretries: 3\noffset: -7\ncount: 0\nthreshold: 0.85\nname: agent-42\n---\n',
      { timeout: 30, retries: 3, offset: -7, count: 0, threshold: 0.85, name: 'agent-42' }, ''],
    ['parses inline array values, empty or whitespace-only as []',
      '---\ntools: [read_file, search, edit]\nnone: []\nblank: [  ]\n---\n',
      { tools: ['read_file', 'search', 'edit'], none: [], blank: [] }, ''],
  ];

  for (const [title, content, frontmatter, body] of cases) {
    it(title, () => {
      assert.deepEqual(parse(content), { frontmatter, body });
    });
  }
});
