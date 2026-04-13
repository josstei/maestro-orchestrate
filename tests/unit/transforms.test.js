'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const agentStub = require('../../src/transforms/agent-stub');
const skillDiscoveryStub = require('../../src/transforms/skill-discovery-stub');

describe('agent-stub transform', () => {
  const kebabRuntime = { name: 'claude', agentNaming: 'kebab-case' };
  const snakeRuntime = { name: 'gemini', agentNaming: 'snake_case' };

  const contentWithFrontmatter = [
    '---',
    'name: code-reviewer',
    'description: Reviews code for quality.',
    '---',
    '',
    'This is the full methodology body.',
  ].join('\n');

  it('preserves frontmatter and replaces body with MCP stub', () => {
    const result = agentStub(contentWithFrontmatter, kebabRuntime);

    assert.ok(result.startsWith('---\n'));
    assert.ok(result.includes('name: code-reviewer'));
    assert.ok(result.includes('description: Reviews code for quality.'));
    assert.ok(!result.includes('This is the full methodology body.'));
    assert.ok(result.includes('get_agent'));
  });

  it('includes the agent name in the stub text', () => {
    const result = agentStub(contentWithFrontmatter, kebabRuntime);

    assert.ok(result.includes('"code-reviewer"'));
  });

  it('converts snake_case agent name back to kebab-case for the canonical name in the stub', () => {
    const snakeContent = [
      '---',
      'name: code_reviewer',
      'description: Reviews code.',
      '---',
      '',
      'Methodology body.',
    ].join('\n');

    const result = agentStub(snakeContent, snakeRuntime);

    assert.ok(result.includes('"code-reviewer"'));
    assert.ok(!result.includes('"code_reviewer"'));
  });

  it('handles content with no frontmatter by returning the stub body only', () => {
    const noFrontmatter = 'Just a plain body with no frontmatter.';

    const result = agentStub(noFrontmatter, kebabRuntime);

    assert.ok(!result.startsWith('---'));
    assert.ok(result.includes('get_agent'));
  });

  it('handles content with unclosed frontmatter by appending the stub after existing content', () => {
    const unclosed = '---\nname: my-agent\nno closing delimiter';

    const result = agentStub(unclosed, kebabRuntime);

    assert.ok(result.includes('name: my-agent'));
    assert.ok(result.includes('get_agent'));
    assert.ok(result.includes('"my-agent"'));
  });
});

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
