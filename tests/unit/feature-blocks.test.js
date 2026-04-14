'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { stripFeatureBlocks } = require('../../src/core/feature-blocks');

describe('stripFeatureBlocks', () => {
  it('keeps body content when flag is truthy', () => {
    const content = '<!-- @feature alpha -->\nalpha content\n<!-- @end-feature -->\n';
    const result = stripFeatureBlocks(content, { alpha: true });
    assert.equal(result, 'alpha content\n');
  });

  it('removes body content when flag is falsy', () => {
    const content = 'before\n<!-- @feature alpha -->\nalpha content\n<!-- @end-feature -->\nafter\n';
    const result = stripFeatureBlocks(content, { alpha: false });
    assert.equal(result, 'before\nafter\n');
  });

  it('throws on unknown flag in strict mode', () => {
    const content = '<!-- @feature unknown -->\nbody\n<!-- @end-feature -->\n';
    assert.throws(
      () => stripFeatureBlocks(content, {}, { mode: 'strict' }),
      { message: 'Unknown feature flag: "unknown"' }
    );
  });

  it('silently removes content for unknown flag in lenient mode', () => {
    const content = 'before\n<!-- @feature unknown -->\nbody\n<!-- @end-feature -->\nafter\n';
    const result = stripFeatureBlocks(content, {}, { mode: 'lenient' });
    assert.equal(result, 'before\nafter\n');
  });

  it('defaults to strict mode when opts is omitted', () => {
    const content = '<!-- @feature missing -->\nbody\n<!-- @end-feature -->\n';
    assert.throws(
      () => stripFeatureBlocks(content, {}),
      { message: 'Unknown feature flag: "missing"' }
    );
  });

  it('handles multiple feature blocks in same content', () => {
    const content = [
      'header',
      '<!-- @feature alpha -->',
      'alpha body',
      '<!-- @end-feature -->',
      '<!-- @feature beta -->',
      'beta body',
      '<!-- @end-feature -->',
      'footer',
      '',
    ].join('\n');

    const result = stripFeatureBlocks(content, { alpha: true, beta: false });
    assert.equal(result, 'header\nalpha body\nfooter\n');
  });

  it('preserves nested content within feature blocks', () => {
    const body = '## Heading\n\n- item 1\n- item 2\n\n```js\nconst x = 1;\n```\n';
    const content = '<!-- @feature docs -->\n' + body + '<!-- @end-feature -->\n';
    const result = stripFeatureBlocks(content, { docs: true });
    assert.equal(result, body);
  });

  it('collapses triple+ newlines to double after stripping', () => {
    const content = 'before\n<!-- @feature removed -->\nbody\n<!-- @end-feature -->\n\n\nafter\n';
    const result = stripFeatureBlocks(content, { removed: false });
    assert.equal(result, 'before\n\nafter\n');
  });

  it('passes through content with no feature blocks unchanged', () => {
    const content = '# Title\n\nSome regular markdown content.\n';
    const result = stripFeatureBlocks(content, { anything: true });
    assert.equal(result, content);
  });

  it('throws on any flag when features object is empty in strict mode', () => {
    const content = '<!-- @feature any -->\nbody\n<!-- @end-feature -->\n';
    assert.throws(
      () => stripFeatureBlocks(content, {}, { mode: 'strict' }),
      { message: 'Unknown feature flag: "any"' }
    );
  });

  it('strips all flags when features object is empty in lenient mode', () => {
    const content = [
      '<!-- @feature a -->',
      'a content',
      '<!-- @end-feature -->',
      '<!-- @feature b -->',
      'b content',
      '<!-- @end-feature -->',
      '',
    ].join('\n');

    const result = stripFeatureBlocks(content, {}, { mode: 'lenient' });
    assert.equal(result, '');
  });
});
