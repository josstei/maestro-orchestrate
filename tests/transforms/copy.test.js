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

  // --- Missing tests ---

  it('should preserve content with special characters unchanged', () => {
    const content = 'Line with $pecial ch@racters: ${extensionPath} & <tags>';
    assert.equal(copy(content), content);
  });

  it('should preserve multi-line content with varied line endings', () => {
    const content = 'line1\nline2\nline3\n';
    assert.equal(copy(content), content);
  });

  it('should preserve content with unicode characters', () => {
    const content = 'Unicode: \u00e9\u00e0\u00fc \u2014 \u2018quotes\u2019';
    assert.equal(copy(content), content);
  });

  it('should ignore the runtime parameter entirely', () => {
    const content = 'test content';
    assert.equal(copy(content, { name: 'gemini' }), content);
    assert.equal(copy(content, { name: 'claude' }), content);
    assert.equal(copy(content, undefined), content);
    assert.equal(copy(content, null), content);
  });
});
