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

  // --- Missing tests ---

  it('should handle empty feature block body when kept', () => {
    const content = [
      'before',
      '<!-- @feature emptyFlag -->',
      '<!-- @end-feature -->',
      'after',
    ].join('\n');
    const runtime = { features: { emptyFlag: true } };
    const result = stripFeature(content, runtime, {});
    assert.ok(result.includes('before'));
    assert.ok(result.includes('after'));
    assert.ok(!result.includes('@feature'));
  });

  it('should handle empty feature block body when removed', () => {
    const content = [
      'before',
      '<!-- @feature emptyFlag -->',
      '<!-- @end-feature -->',
      'after',
    ].join('\n');
    const runtime = { features: { emptyFlag: false } };
    const result = stripFeature(content, runtime, {});
    assert.ok(result.includes('before'));
    assert.ok(result.includes('after'));
    assert.ok(!result.includes('@feature'));
  });

  it('should handle feature block at the very start of file', () => {
    const content = [
      '<!-- @feature topFlag -->',
      'top content',
      '<!-- @end-feature -->',
      'rest of file',
    ].join('\n');
    const runtime = { features: { topFlag: false } };
    const result = stripFeature(content, runtime, {});
    assert.ok(!result.includes('top content'));
    assert.ok(result.includes('rest of file'));
  });

  it('should handle feature block at the very end of file', () => {
    const content = [
      'start of file',
      '<!-- @feature endFlag -->',
      'end content',
      '<!-- @end-feature -->',
    ].join('\n');
    const runtime = { features: { endFlag: false } };
    const result = stripFeature(content, runtime, {});
    assert.ok(!result.includes('end content'));
    assert.ok(result.includes('start of file'));
  });

  it('should handle JS feature block at file start', () => {
    const content = [
      '// @feature jsTop',
      'const x = 1;',
      '// @end-feature',
      'const y = 2;',
    ].join('\n');
    const runtime = { features: { jsTop: false } };
    const result = stripFeature(content, runtime, {});
    assert.ok(!result.includes('const x'));
    assert.ok(result.includes('const y'));
  });

  it('should handle multi-line body in feature block', () => {
    const content = [
      'before',
      '<!-- @feature multiLine -->',
      'line 1',
      'line 2',
      'line 3',
      '<!-- @end-feature -->',
      'after',
    ].join('\n');
    const runtime = { features: { multiLine: true } };
    const result = stripFeature(content, runtime, {});
    assert.ok(result.includes('line 1'));
    assert.ok(result.includes('line 2'));
    assert.ok(result.includes('line 3'));
    assert.ok(!result.includes('@feature'));
  });

  it('should handle mixed markdown and JS feature blocks in same content', () => {
    const content = [
      'shared content',
      '<!-- @feature mdFlag -->',
      'markdown block',
      '<!-- @end-feature -->',
      'const code = true;',
      '// @feature jsFlag',
      'const extra = false;',
      '// @end-feature',
      'end',
    ].join('\n');
    const runtime = { features: { mdFlag: true, jsFlag: false } };
    const result = stripFeature(content, runtime, {});
    assert.ok(result.includes('markdown block'));
    assert.ok(!result.includes('const extra'));
    assert.ok(result.includes('const code'));
  });

  it('should return content unchanged when no feature blocks present', () => {
    const content = 'Just plain content.\nNo feature blocks here.';
    const runtime = { features: {} };
    const result = stripFeature(content, runtime, {});
    assert.equal(result, content);
  });

  it('should handle indented feature markers', () => {
    const content = [
      'before',
      '  <!-- @feature indented -->',
      '  indented content',
      '  <!-- @end-feature -->',
      'after',
    ].join('\n');
    const runtime = { features: { indented: true } };
    const result = stripFeature(content, runtime, {});
    assert.ok(result.includes('indented content'));
    assert.ok(!result.includes('@feature'));
  });

  it('should handle tab-indented feature markers', () => {
    const content = [
      'before',
      '\t// @feature tabbed',
      '\tconst tabbed = true;',
      '\t// @end-feature',
      'after',
    ].join('\n');
    const runtime = { features: { tabbed: false } };
    const result = stripFeature(content, runtime, {});
    assert.ok(!result.includes('const tabbed'));
    assert.ok(result.includes('before'));
    assert.ok(result.includes('after'));
  });

  it('should error on unknown feature in JS blocks too', () => {
    const content = '// @feature mystery\ncode\n// @end-feature';
    const runtime = { features: {} };
    assert.throws(() => stripFeature(content, runtime, {}), /Unknown feature flag: "mystery"/);
  });

  it('should handle nested features where both are true', () => {
    const nested = [
      '<!-- @feature outer -->',
      'outer content',
      '<!-- @feature inner -->',
      'inner content',
      '<!-- @end-feature -->',
      'more outer',
      '<!-- @end-feature -->',
    ].join('\n');
    const runtime = { features: { outer: true, inner: true } };
    const result = stripFeature(nested, runtime, {});
    assert.ok(result.includes('outer content'));
    assert.ok(result.includes('inner content'));
    assert.ok(result.includes('more outer'));
    assert.ok(!result.includes('@feature'));
  });

  it('should handle nested features where both are false', () => {
    const nested = [
      'keep this',
      '<!-- @feature outer -->',
      'outer content',
      '<!-- @feature inner -->',
      'inner content',
      '<!-- @end-feature -->',
      'more outer',
      '<!-- @end-feature -->',
      'keep this too',
    ].join('\n');
    const runtime = { features: { outer: false, inner: false } };
    const result = stripFeature(nested, runtime, {});
    assert.ok(!result.includes('outer content'));
    assert.ok(!result.includes('inner content'));
    assert.ok(!result.includes('more outer'));
    assert.ok(result.includes('keep this'));
    assert.ok(result.includes('keep this too'));
  });
});
