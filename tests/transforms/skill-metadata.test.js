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
});
