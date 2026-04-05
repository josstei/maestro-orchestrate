const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const injectFrontmatter = require('../../src/transforms/inject-frontmatter');

describe('inject-frontmatter transform', () => {
  const canonicalAgent = [
    '---',
    'name: code-reviewer',
    'description: "Code review specialist."',
    'color: blue',
    'tools: [read_file, glob, grep_search]',
    'max_turns: 15',
    'temperature: 0.2',
    'timeout_mins: 5',
    '---',
    '',
    '## Methodology',
    'Review code carefully.',
  ].join('\n');

  const geminiRuntime = {
    name: 'gemini',
    agentNaming: 'snake_case',
    agentFrontmatter: {
      kind: 'local',
      turnsField: 'max_turns',
      hasTemperature: true,
      hasTimeout: true,
    },
    tools: {
      read_file: 'read_file',
      glob: 'glob',
      grep_search: 'grep_search',
    },
  };

  const claudeRuntime = {
    name: 'claude',
    agentNaming: 'kebab-case',
    agentFrontmatter: {
      model: 'inherit',
      turnsField: 'maxTurns',
    },
    tools: {
      read_file: 'Read',
      glob: 'Glob',
      grep_search: 'Grep',
    },
  };

  it('produces gemini frontmatter with kind, temperature, timeout', () => {
    const result = injectFrontmatter(canonicalAgent, geminiRuntime, {});
    assert.ok(result.includes('name: code_reviewer'));
    assert.ok(result.includes('kind: local'));
    assert.ok(result.includes('temperature: 0.2'));
    assert.ok(result.includes('timeout_mins: 5'));
    assert.ok(result.includes('max_turns: 15'));
    assert.ok(!result.includes('color:'));
    assert.ok(result.includes('## Methodology'));
  });

  it('produces claude frontmatter with model, color, maxTurns', () => {
    const result = injectFrontmatter(canonicalAgent, claudeRuntime, {});
    assert.ok(result.includes('name: code-reviewer'));
    assert.ok(result.includes('model: inherit'));
    assert.ok(result.includes('color: blue'));
    assert.ok(result.includes('maxTurns: 15'));
    assert.ok(!result.includes('temperature'));
    assert.ok(!result.includes('timeout_mins'));
    assert.ok(!result.includes('kind:'));
  });

  it('uses tools.<runtime> override when present', () => {
    const agentWithOverride = [
      '---',
      'name: architect',
      'description: "Architect."',
      'color: blue',
      'tools: [read_file, glob]',
      'tools.claude: [Read, Glob, Grep, WebSearch, WebFetch]',
      'max_turns: 15',
      'temperature: 0.3',
      'timeout_mins: 5',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = injectFrontmatter(agentWithOverride, claudeRuntime, {});
    assert.ok(result.includes('- Read'));
    assert.ok(result.includes('- WebFetch'));
  });

  it('maps canonical tool names through runtime.tools when no override', () => {
    const result = injectFrontmatter(canonicalAgent, claudeRuntime, {});
    assert.ok(result.includes('- Read'));
    assert.ok(result.includes('- Glob'));
    assert.ok(result.includes('- Grep'));
  });

  it('embeds example blocks into claude description field', () => {
    const agentWithExamples = [
      '---',
      'name: code-reviewer',
      'description: "Code review specialist."',
      'color: blue',
      'tools: [read_file, glob, grep_search]',
      'max_turns: 15',
      'temperature: 0.2',
      'timeout_mins: 5',
      '---',
      '',
      '<example>',
      'Context: User wants a review.',
      '</example>',
      '',
      '## Methodology',
      'Review code carefully.',
    ].join('\n');
    const result = injectFrontmatter(agentWithExamples, claudeRuntime, {});
    assert.ok(result.includes('description: |'));
    assert.ok(result.includes('  <example>'));
    assert.ok(result.includes('  Context: User wants a review.'));
    // Examples should NOT appear in body after frontmatter
    const afterFrontmatter = result.split('---\n').slice(2).join('---\n');
    assert.ok(!afterFrontmatter.includes('<example>'));
  });

  it('keeps examples in body for gemini (no embedding)', () => {
    const agentWithExamples = [
      '---',
      'name: code-reviewer',
      'description: "Code review specialist."',
      'color: blue',
      'tools: [read_file, glob, grep_search]',
      'max_turns: 15',
      'temperature: 0.2',
      'timeout_mins: 5',
      '---',
      '',
      '<example>',
      'Context: User wants a review.',
      '</example>',
      '',
      '## Methodology',
      'Review code carefully.',
    ].join('\n');
    const result = injectFrontmatter(agentWithExamples, geminiRuntime, {});
    assert.ok(!result.includes('description: |'));
    assert.ok(result.includes('description: "Code review specialist."'));
  });
});
