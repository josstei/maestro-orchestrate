'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const skillDiscoveryStub = require('../../src/transforms/skill-discovery-stub');

describe('skill-discovery-stub transform', () => {
  const claudeRuntime = { name: 'claude' };
  const geminiRuntime = { name: 'gemini' };

  const skillContent = [
    '---',
    'name: delegation',
    'description: Delegation methodology for agents.',
    'tools: [read_file]',
    '---',
    '',
    'Full methodology content lives here.',
  ].join('\n');

  it('extracts name and description from frontmatter into the stub', () => {
    const result = skillDiscoveryStub(skillContent, claudeRuntime);

    assert.ok(result.includes('name: delegation'));
    assert.ok(result.includes('description: Delegation methodology for agents.'));
  });

  it('adds user-invocable: false for claude runtime', () => {
    const result = skillDiscoveryStub(skillContent, claudeRuntime);

    assert.ok(result.includes('user-invocable: false'));
  });

  it('does not add user-invocable for gemini runtime', () => {
    const result = skillDiscoveryStub(skillContent, geminiRuntime);

    assert.ok(!result.includes('user-invocable'));
  });

  it('points to get_skill_content in the body', () => {
    const result = skillDiscoveryStub(skillContent, claudeRuntime);

    assert.ok(result.includes('get_skill_content'));
    assert.ok(result.includes('"delegation"'));
  });
});
