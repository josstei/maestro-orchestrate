'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { escapeYaml } = require('../../src/lib/yaml-emit');
const { parse } = require('../../src/lib/frontmatter');

/** Parse `raw` as the inner text of a double-quoted frontmatter value. */
const valueOf = (raw) => parse(`---\nk: "${raw}"\n---\n`).frontmatter.k;

describe('escapeYaml', () => {
  for (const [title, input, expected] of [
    ['escapes backslashes', 'path\\to\\file', 'path\\\\to\\\\file'],
    ['escapes double quotes', 'say "hello"', 'say \\"hello\\"'],
    ['escapes both backslashes and quotes', 'a\\"b', 'a\\\\\\"b'],
    ['returns unchanged string when no special characters', 'simple value', 'simple value'],
    ['handles empty string', '', ''],
  ]) {
    it(title, () => {
      assert.equal(escapeYaml(input), expected);
    });
  }

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

