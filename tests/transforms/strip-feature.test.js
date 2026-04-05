const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const stripFeature = require('../../src/transforms/strip-feature');

describe('strip-feature transform', () => {
  const mdContent = [
    'Shared line 1.',
    '',
    '<!-- @feature exampleBlocks -->',
    'This is example content.',
    '<!-- @end-feature -->',
    '',
    'Shared line 2.',
  ].join('\n');

  const jsContent = [
    '// Shared code',
    '',
    '// @feature mcpSkillContentHandler',
    'const handler = require("./handler");',
    '// @end-feature',
    '',
    '// More shared code',
  ].join('\n');

  it('keeps flagged content when feature is true (markdown)', () => {
    const runtime = { features: { exampleBlocks: true } };
    const result = stripFeature(mdContent, runtime, {});
    assert.ok(!result.includes('@feature'));
    assert.ok(!result.includes('@end-feature'));
    assert.ok(result.includes('This is example content.'));
    assert.ok(result.includes('Shared line 1.'));
    assert.ok(result.includes('Shared line 2.'));
  });

  it('removes flagged content when feature is false (markdown)', () => {
    const runtime = { features: { exampleBlocks: false } };
    const result = stripFeature(mdContent, runtime, {});
    assert.ok(!result.includes('@feature'));
    assert.ok(!result.includes('This is example content.'));
    assert.ok(result.includes('Shared line 1.'));
    assert.ok(result.includes('Shared line 2.'));
  });

  it('keeps flagged content when feature is true (js)', () => {
    const runtime = { features: { mcpSkillContentHandler: true } };
    const result = stripFeature(jsContent, runtime, {});
    assert.ok(!result.includes('@feature'));
    assert.ok(result.includes('const handler'));
  });

  it('removes flagged content when feature is false (js)', () => {
    const runtime = { features: { mcpSkillContentHandler: false } };
    const result = stripFeature(jsContent, runtime, {});
    assert.ok(!result.includes('const handler'));
    assert.ok(result.includes('// Shared code'));
    assert.ok(result.includes('// More shared code'));
  });

  it('handles nested features (innermost first)', () => {
    const nested = [
      'outer start',
      '<!-- @feature a -->',
      'a content',
      '<!-- @feature b -->',
      'b content',
      '<!-- @end-feature -->',
      'a after b',
      '<!-- @end-feature -->',
      'outer end',
    ].join('\n');
    const runtime = { features: { a: true, b: false } };
    const result = stripFeature(nested, runtime, {});
    assert.ok(result.includes('a content'));
    assert.ok(!result.includes('b content'));
    assert.ok(result.includes('a after b'));
  });

  it('errors on unknown feature names', () => {
    const content = '<!-- @feature unknownFlag -->\nstuff\n<!-- @end-feature -->';
    const runtime = { features: {} };
    assert.throws(() => stripFeature(content, runtime, {}), /Unknown feature flag: "unknownFlag"/);
  });

  it('handles multiple independent features', () => {
    const content = [
      'shared',
      '<!-- @feature a -->',
      'a content',
      '<!-- @end-feature -->',
      'middle',
      '<!-- @feature b -->',
      'b content',
      '<!-- @end-feature -->',
      'end',
    ].join('\n');
    const runtime = { features: { a: true, b: false } };
    const result = stripFeature(content, runtime, {});
    assert.ok(result.includes('a content'));
    assert.ok(!result.includes('b content'));
    assert.ok(result.includes('middle'));
  });

  it('cleans up blank lines left by removed blocks', () => {
    const content = 'before\n\n<!-- @feature x -->\nremoved\n<!-- @end-feature -->\n\nafter';
    const runtime = { features: { x: false } };
    const result = stripFeature(content, runtime, {});
    assert.ok(!result.includes('\n\n\n'));
  });
});
