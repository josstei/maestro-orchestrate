const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const copy = require('../../src/transforms/copy');

describe('copy transform', () => {
  it('returns content unchanged', () => {
    const content = '# Hello\nSome content here.';
    const runtime = { name: 'gemini' };
    assert.equal(copy(content, runtime, {}), content);
  });

  it('preserves empty content', () => {
    assert.equal(copy('', { name: 'claude' }, {}), '');
  });
});
