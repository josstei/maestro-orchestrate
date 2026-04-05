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

  it('flattens array tool mappings when no per-runtime override', () => {
    const agentWithArrayTools = [
      '---',
      'name: coder',
      'description: "Coder."',
      'color: green',
      'tools: [read_file, write_todos]',
      'max_turns: 25',
      'temperature: 0.2',
      'timeout_mins: 10',
      '---',
      '',
      'Body.',
    ].join('\n');
    const runtimeWithArrayMapping = {
      name: 'claude',
      agentNaming: 'kebab-case',
      agentFrontmatter: { model: 'inherit', turnsField: 'maxTurns' },
      tools: {
        read_file: 'Read',
        write_todos: ['TaskCreate', 'TaskUpdate', 'TaskList'],
      },
    };
    const result = injectFrontmatter(agentWithArrayTools, runtimeWithArrayMapping, {});
    assert.ok(result.includes('- Read'));
    assert.ok(result.includes('- TaskCreate'));
    assert.ok(result.includes('- TaskUpdate'));
    assert.ok(result.includes('- TaskList'));
  });

  // --- Missing tests ---

  it('should handle agent with no tools', () => {
    const noToolsAgent = [
      '---',
      'name: product-manager',
      'description: "Product manager."',
      'color: purple',
      'tools: []',
      'max_turns: 10',
      'temperature: 0.5',
      'timeout_mins: 5',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = injectFrontmatter(noToolsAgent, claudeRuntime, {});
    assert.ok(!result.includes('tools:'));
    assert.ok(result.includes('name: product-manager'));
  });

  it('should handle agent with no color field', () => {
    const noColorAgent = [
      '---',
      'name: tester',
      'description: "Tester."',
      'tools: [read_file]',
      'max_turns: 10',
      'temperature: 0.3',
      'timeout_mins: 5',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = injectFrontmatter(noColorAgent, claudeRuntime, {});
    assert.ok(!result.includes('color:'));
    assert.ok(result.includes('name: tester'));
  });

  it('should handle agent with no description', () => {
    const noDescAgent = [
      '---',
      'name: tester',
      'tools: [read_file]',
      'max_turns: 10',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = injectFrontmatter(noDescAgent, claudeRuntime, {});
    // Should produce description: "" (empty quoted string in Claude, since no newlines)
    assert.ok(result.includes('description:'));
  });

  it('should handle content with no frontmatter', () => {
    const noFrontmatter = 'Just body content.\nNo frontmatter here.';
    const result = injectFrontmatter(noFrontmatter, claudeRuntime, {});
    // parseFrontmatter returns empty frontmatter + full body
    // injectFrontmatter should produce minimal frontmatter
    assert.ok(result.includes('---'));
    assert.ok(result.includes('Just body content.'));
  });

  it('should handle content with unclosed frontmatter (no closing ---)', () => {
    const badFrontmatter = '---\nname: test\nno closing fence';
    const result = injectFrontmatter(badFrontmatter, claudeRuntime, {});
    // parseFrontmatter returns empty frontmatter + full body for unclosed
    assert.ok(result.includes('---'));
  });

  it('should produce correct gemini field ordering: name, kind, description, tools, temperature, max_turns, timeout', () => {
    const result = injectFrontmatter(canonicalAgent, geminiRuntime, {});
    const lines = result.split('\n');
    const nameIdx = lines.findIndex((l) => l.startsWith('name:'));
    const kindIdx = lines.findIndex((l) => l.startsWith('kind:'));
    const descIdx = lines.findIndex((l) => l.startsWith('description:'));
    const toolsIdx = lines.findIndex((l) => l === 'tools:');
    const tempIdx = lines.findIndex((l) => l.startsWith('temperature:'));
    const turnsIdx = lines.findIndex((l) => l.startsWith('max_turns:'));
    const timeoutIdx = lines.findIndex((l) => l.startsWith('timeout_mins:'));

    assert.ok(nameIdx < kindIdx, 'name should come before kind');
    assert.ok(kindIdx < descIdx, 'kind should come before description');
    assert.ok(descIdx < toolsIdx, 'description should come before tools');
    assert.ok(toolsIdx < tempIdx, 'tools should come before temperature');
    assert.ok(tempIdx < turnsIdx, 'temperature should come before max_turns');
    assert.ok(turnsIdx < timeoutIdx, 'max_turns should come before timeout_mins');
  });

  it('should produce correct claude field ordering: name, description, model, color, maxTurns, tools', () => {
    const result = injectFrontmatter(canonicalAgent, claudeRuntime, {});
    const lines = result.split('\n');
    const nameIdx = lines.findIndex((l) => l.startsWith('name:'));
    const descIdx = lines.findIndex((l) => l.startsWith('description:'));
    const modelIdx = lines.findIndex((l) => l.startsWith('model:'));
    const colorIdx = lines.findIndex((l) => l.startsWith('color:'));
    const turnsIdx = lines.findIndex((l) => l.startsWith('maxTurns:'));
    const toolsIdx = lines.findIndex((l) => l === 'tools:');

    assert.ok(nameIdx < descIdx, 'name should come before description');
    assert.ok(descIdx < modelIdx, 'description should come before model');
    assert.ok(modelIdx < colorIdx, 'model should come before color');
    assert.ok(colorIdx < turnsIdx, 'color should come before maxTurns');
    assert.ok(turnsIdx < toolsIdx, 'maxTurns should come before tools');
  });

  it('should handle multiple example blocks in body for claude', () => {
    const multiExamples = [
      '---',
      'name: coder',
      'description: "A coder."',
      'color: green',
      'tools: [read_file]',
      'max_turns: 10',
      '---',
      '',
      '<example>',
      'First example.',
      '</example>',
      '',
      '<example>',
      'Second example.',
      '</example>',
      '',
      '## Body content',
    ].join('\n');
    const result = injectFrontmatter(multiExamples, claudeRuntime, {});
    assert.ok(result.includes('description: |'));
    assert.ok(result.includes('  <example>'));
    assert.ok(result.includes('  First example.'));
    assert.ok(result.includes('  Second example.'));
    // Body should not contain examples
    const bodyParts = result.split('---\n');
    const body = bodyParts.slice(2).join('---\n');
    assert.ok(!body.includes('<example>'));
    assert.ok(body.includes('## Body content'));
  });

  it('should handle agent with no max_turns', () => {
    const noTurnsAgent = [
      '---',
      'name: tester',
      'description: "Tester."',
      'color: green',
      'tools: [read_file]',
      'temperature: 0.3',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = injectFrontmatter(noTurnsAgent, claudeRuntime, {});
    assert.ok(!result.includes('maxTurns:'));
  });

  it('should handle agent with no temperature (gemini)', () => {
    const noTempAgent = [
      '---',
      'name: tester',
      'description: "Tester."',
      'tools: [read_file]',
      'max_turns: 10',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = injectFrontmatter(noTempAgent, geminiRuntime, {});
    assert.ok(!result.includes('temperature:'));
  });

  it('should handle agent with no timeout_mins (gemini)', () => {
    const noTimeoutAgent = [
      '---',
      'name: tester',
      'description: "Tester."',
      'tools: [read_file]',
      'max_turns: 10',
      'temperature: 0.3',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = injectFrontmatter(noTimeoutAgent, geminiRuntime, {});
    assert.ok(!result.includes('timeout_mins:'));
  });

  it('should handle tool that is not in runtime.tools mapping', () => {
    const agentWithUnknownTool = [
      '---',
      'name: tester',
      'description: "Tester."',
      'tools: [read_file, unknown_tool]',
      'max_turns: 10',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = injectFrontmatter(agentWithUnknownTool, claudeRuntime, {});
    // unknown_tool should be kept as-is since runtime.tools[unknown_tool] is undefined
    assert.ok(result.includes('- unknown_tool'));
    assert.ok(result.includes('- Read'));
  });

  it('should handle description with quotes embedded', () => {
    const quotedDesc = [
      '---',
      'name: tester',
      'description: "Tests things \\"carefully\\"."',
      'tools: [read_file]',
      'max_turns: 10',
      '---',
      '',
      'Body.',
    ].join('\n');
    // This tests that parseValue and stripQuotes handle the value
    const result = injectFrontmatter(quotedDesc, geminiRuntime, {});
    assert.ok(result.includes('description:'));
  });

  it('should handle numeric values in frontmatter correctly', () => {
    const result = injectFrontmatter(canonicalAgent, geminiRuntime, {});
    // temperature should be a number, not a string
    assert.ok(result.includes('temperature: 0.2'));
    assert.ok(result.includes('max_turns: 15'));
    assert.ok(result.includes('timeout_mins: 5'));
  });

  it('should produce valid frontmatter delimiters (starts and ends with ---)', () => {
    const result = injectFrontmatter(canonicalAgent, claudeRuntime, {});
    const lines = result.split('\n');
    assert.equal(lines[0], '---');
    const secondDashIdx = lines.indexOf('---', 1);
    assert.ok(secondDashIdx > 0, 'Should have a closing --- delimiter');
  });

  it('should use gemini tools override when running for gemini', () => {
    const agentWithGeminiOverride = [
      '---',
      'name: architect',
      'description: "Architect."',
      'tools: [read_file]',
      'tools.gemini: [read_file, glob, grep_search, google_web_search]',
      'max_turns: 15',
      'temperature: 0.3',
      'timeout_mins: 5',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = injectFrontmatter(agentWithGeminiOverride, geminiRuntime, {});
    assert.ok(result.includes('- google_web_search'));
    // Should use the override, not the canonical tools
    assert.ok(result.includes('- glob'));
  });
});
