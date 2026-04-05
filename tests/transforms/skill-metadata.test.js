const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const skillMetadata = require('../../src/transforms/skill-metadata');

describe('skill-metadata transform', () => {
  const skillContent = [
    '---',
    'name: execution',
    'description: Phase execution methodology.',
    '---',
    '',
    '## Content here',
  ].join('\n');

  it('adds user-invocable: false for claude', () => {
    const runtime = { name: 'claude' };
    const result = skillMetadata(skillContent, runtime, {});
    assert.ok(result.includes('user-invocable: false'));
  });

  it('does not add user-invocable for gemini', () => {
    const runtime = { name: 'gemini' };
    const result = skillMetadata(skillContent, runtime, {});
    assert.ok(!result.includes('user-invocable'));
  });

  it('preserves existing frontmatter fields', () => {
    const runtime = { name: 'claude' };
    const result = skillMetadata(skillContent, runtime, {});
    assert.ok(result.includes('name: execution'));
    assert.ok(result.includes('description: Phase execution methodology.'));
  });

  // --- Missing tests ---

  it('should insert user-invocable: false immediately before closing ---', () => {
    const runtime = { name: 'claude' };
    const result = skillMetadata(skillContent, runtime, {});
    const lines = result.split('\n');
    const closingIdx = lines.indexOf('---', 1);
    assert.ok(closingIdx > 0);
    assert.equal(lines[closingIdx - 1], 'user-invocable: false');
  });

  it('should preserve body content after frontmatter', () => {
    const runtime = { name: 'claude' };
    const result = skillMetadata(skillContent, runtime, {});
    assert.ok(result.includes('## Content here'));
  });

  it('should return gemini content completely unchanged (identity)', () => {
    const runtime = { name: 'gemini' };
    const result = skillMetadata(skillContent, runtime, {});
    assert.equal(result, skillContent);
  });

  it('should handle skill with more frontmatter fields', () => {
    const richSkill = [
      '---',
      'name: validation',
      'description: Validation methodology.',
      'custom-field: some-value',
      '---',
      '',
      '## Validation steps',
    ].join('\n');
    const runtime = { name: 'claude' };
    const result = skillMetadata(richSkill, runtime, {});
    assert.ok(result.includes('name: validation'));
    assert.ok(result.includes('custom-field: some-value'));
    assert.ok(result.includes('user-invocable: false'));
    assert.ok(result.includes('## Validation steps'));
  });

  it('should handle skill with empty body', () => {
    const emptyBody = '---\nname: test\n---';
    const runtime = { name: 'claude' };
    const result = skillMetadata(emptyBody, runtime, {});
    assert.ok(result.includes('user-invocable: false'));
    assert.ok(result.includes('name: test'));
  });

  it('should not add user-invocable for unknown runtime names', () => {
    // The function only checks for 'gemini' to return early;
    // for any other runtime name, it inserts user-invocable
    const content = '---\nname: test\n---\nbody';
    const runtime = { name: 'other' };
    const result = skillMetadata(content, runtime, {});
    assert.ok(result.includes('user-invocable: false'));
  });

  it('should handle content with no frontmatter gracefully', () => {
    const noFrontmatter = 'No frontmatter here.';
    const runtime = { name: 'claude' };
    const result = skillMetadata(noFrontmatter, runtime, {});
    // The regex won't match, so content should be unchanged
    assert.equal(result, noFrontmatter);
  });

  it('should handle content with --- in the body (not frontmatter)', () => {
    const bodyDashes = [
      '---',
      'name: test',
      '---',
      '',
      'Some text with --- in it.',
    ].join('\n');
    const runtime = { name: 'claude' };
    const result = skillMetadata(bodyDashes, runtime, {});
    assert.ok(result.includes('user-invocable: false'));
    // The regex matches the first --- pair, so body --- should be untouched
    assert.ok(result.includes('Some text with --- in it.'));
  });
});
