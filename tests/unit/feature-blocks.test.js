'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { stripExamples, stripFeatureBlocks } = require('../../src/core/feature-blocks');

const block = (flag, body) => `<!-- @feature ${flag} -->\n${body}<!-- @end-feature -->\n`;
const NESTED = '## Heading\n\n- item 1\n- item 2\n\n```js\nconst x = 1;\n```\n';
const PLAIN = '# Title\n\nSome regular markdown content.\n';
const UNCLOSED = 'before\n<example>\nunclosed\n';

describe('stripFeatureBlocks', () => {
  for (const [name, content, flags, expected] of [
    ['keeps body content when flag is truthy', block('alpha', 'alpha content\n'), { alpha: true }, 'alpha content\n'],
    ['removes body content when flag is falsy',
      `before\n${block('alpha', 'alpha content\n')}after\n`, { alpha: false }, 'before\nafter\n'],
    ['handles multiple feature blocks in same content',
      `header\n${block('alpha', 'alpha body\n')}${block('beta', 'beta body\n')}footer\n`,
      { alpha: true, beta: false }, 'header\nalpha body\nfooter\n'],
    ['preserves nested content within feature blocks', block('docs', NESTED), { docs: true }, NESTED],
    ['collapses triple+ newlines to double after stripping',
      `before\n${block('removed', 'body\n')}\n\nafter\n`, { removed: false }, 'before\n\nafter\n'],
    ['passes through content with no feature blocks unchanged', PLAIN, { anything: true }, PLAIN],
  ]) {
    it(name, () => {
      assert.equal(stripFeatureBlocks(content, flags), expected);
    });
  }

  it('throws on unknown flag', () => {
    assert.throws(() => stripFeatureBlocks(block('unknown', 'body\n'), {}), {
      message: 'Unknown feature flag: "unknown"',
    });
  });
});

describe('stripExamples', () => {
  for (const [name, content, expected] of [
    ['removes every example block and collapses blank lines across the frontmatter boundary',
      '---\nname: coder\n---\n<example>\nfirst\n</example>\n\n<example>\nsecond\n</example>\n\nMethodology body.\n',
      '---\nname: coder\n---\n\nMethodology body.\n'],
    ['accepts trailing whitespace on the example tags, as the stub scanner does',
      'before\n<example> \nbody\n</example>\t\nafter\n', 'before\nafter\n'],
    ['leaves an unclosed example in place instead of throwing', UNCLOSED, UNCLOSED],
  ]) {
    it(name, () => {
      assert.equal(stripExamples(content), expected);
    });
  }
});
