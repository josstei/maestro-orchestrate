'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const agentStub = require('../../src/transforms/agent-stub');
const { getRuntimeConfig } = require('../../src/mcp/runtime/runtime-config-map');

describe('agent-stub transform', () => {
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

  const geminiRuntime = getRuntimeConfig('gemini');
  const claudeRuntime = getRuntimeConfig('claude');
  const qwenRuntime = getRuntimeConfig('qwen');

  function stubBody(name) {
    return (
      '\nAgent methodology loaded via MCP tool `get_agent`. ' +
      `Call \`get_agent(agents: ["${name}"])\` to read the full methodology at delegation time.\n`
    );
  }

  function parseDocument(result) {
    const lines = result.split('\n');
    assert.equal(lines[0], '---');

    const closingIdx = lines.indexOf('---', 1);
    assert.notEqual(closingIdx, -1, 'Expected a closing frontmatter fence');

    return {
      frontmatter: lines.slice(1, closingIdx),
      body: lines.slice(closingIdx + 1).join('\n'),
    };
  }

  function assertDocument(result, expectedFrontmatter, expectedBody) {
    const { frontmatter, body } = parseDocument(result);
    assert.deepEqual(frontmatter, expectedFrontmatter);
    assert.equal(body, expectedBody);
  }

  it('produces gemini frontmatter with kind, temperature, timeout and a kebab-case stub name', () => {
    const result = agentStub(canonicalAgent, geminiRuntime);
    assertDocument(
      result,
      [
        'name: code_reviewer',
        'kind: local',
        'description: "Code review specialist."',
        'tools:',
        '  - read_file',
        '  - glob',
        '  - grep_search',
        'temperature: 0.2',
        'max_turns: 15',
        'timeout_mins: 5',
      ],
      stubBody('code-reviewer')
    );
  });

  it('produces claude frontmatter with model, color, maxTurns', () => {
    const result = agentStub(canonicalAgent, claudeRuntime);
    assertDocument(
      result,
      [
        'name: code-reviewer',
        'description: "Code review specialist."',
        'model: inherit',
        'color: blue',
        'maxTurns: 15',
        'tools:',
        '  - Read',
        '  - Glob',
        '  - Grep',
      ],
      stubBody('code-reviewer')
    );
  });

  it('produces qwen frontmatter without temperature or timeout, with max_turns before tools', () => {
    const result = agentStub(canonicalAgent, qwenRuntime);
    assertDocument(
      result,
      [
        'name: code_reviewer',
        'kind: local',
        'description: "Code review specialist."',
        'max_turns: 15',
        'tools:',
        '  - read_file',
        '  - glob',
        '  - grep_search',
      ],
      stubBody('code-reviewer')
    );
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
    const result = agentStub(agentWithOverride, claudeRuntime);
    assert.ok(result.includes('- Read'));
    assert.ok(result.includes('- WebFetch'));
  });

  it('embeds example blocks into claude description field', () => {
    const result = agentStub(agentWithExamples, claudeRuntime);
    assertDocument(
      result,
      [
        'name: code-reviewer',
        'description: |',
        '  Code review specialist.',
        '  ',
        '  <example>',
        '  Context: User wants a review.',
        '  </example>',
        'model: inherit',
        'color: blue',
        'maxTurns: 15',
        'tools:',
        '  - Read',
        '  - Glob',
        '  - Grep',
      ],
      stubBody('code-reviewer')
    );
  });

  it('does not embed example blocks for gemini', () => {
    const result = agentStub(agentWithExamples, geminiRuntime);
    assertDocument(
      result,
      [
        'name: code_reviewer',
        'kind: local',
        'description: "Code review specialist."',
        'tools:',
        '  - read_file',
        '  - glob',
        '  - grep_search',
        'temperature: 0.2',
        'max_turns: 15',
        'timeout_mins: 5',
      ],
      stubBody('code-reviewer')
    );
  });

  it('throws on an unclosed <example> tag only when the runtime embeds examples', () => {
    const unclosedExample = [
      '---',
      'name: broken',
      'description: "Broken."',
      '---',
      '<example>',
      'Missing closing example tag',
      '',
    ].join('\n');
    assert.throws(() => agentStub(unclosedExample, claudeRuntime), {
      message: 'Unclosed <example> tag in agent body',
    });
    assert.doesNotThrow(() => agentStub(unclosedExample, geminiRuntime));
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
    const result = agentStub(agentWithArrayTools, claudeRuntime);
    assert.ok(result.includes('- Read'));
    assert.ok(result.includes('- TaskCreate'));
    assert.ok(result.includes('- TaskUpdate'));
    assert.ok(result.includes('- TaskList'));
  });

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
    const result = agentStub(noToolsAgent, claudeRuntime);
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
    const result = agentStub(noColorAgent, claudeRuntime);
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
    const result = agentStub(noDescAgent, claudeRuntime);
    const { frontmatter } = parseDocument(result);
    assert.ok(frontmatter.includes('description: ""'));
  });

  it('should handle content with no frontmatter', () => {
    const noFrontmatter = 'Just body content.\nNo frontmatter here.';
    const result = agentStub(noFrontmatter, claudeRuntime);
    assertDocument(
      result,
      [
        'description: ""',
        'model: inherit',
      ],
      stubBody('')
    );
  });

  it('should treat unclosed frontmatter (no closing ---) as no frontmatter', () => {
    const badFrontmatter = '---\nname: test\nno closing fence';
    const result = agentStub(badFrontmatter, claudeRuntime);
    assertDocument(
      result,
      [
        'description: ""',
        'model: inherit',
      ],
      stubBody('')
    );
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
    const result = agentStub(multiExamples, claudeRuntime);
    const { frontmatter, body } = parseDocument(result);
    assert.ok(frontmatter.includes('description: |'));
    assert.ok(frontmatter.includes('  <example>'));
    assert.ok(frontmatter.includes('  First example.'));
    assert.ok(frontmatter.includes('  Second example.'));
    assert.equal(body, stubBody('coder'));
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
    const result = agentStub(noTurnsAgent, claudeRuntime);
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
    const result = agentStub(noTempAgent, geminiRuntime);
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
    const result = agentStub(noTimeoutAgent, geminiRuntime);
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
    const result = agentStub(agentWithUnknownTool, claudeRuntime);
    // unknown_tool should be kept as-is since runtime.tools[unknown_tool] is undefined
    assert.ok(result.includes('- unknown_tool'));
    assert.ok(result.includes('- Read'));
  });

  it('should round-trip escaped quotes and literal backslashes in quoted descriptions', () => {
    const escapedDesc = [
      '---',
      'name: tester',
      'description: "Tests things \\"carefully\\". Path: C:\\\\temp\\\\agent"',
      'tools: [read_file]',
      'max_turns: 10',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = agentStub(escapedDesc, geminiRuntime);
    assert.ok(result.includes('description: "Tests things \\"carefully\\". Path: C:\\\\temp\\\\agent"'));
  });

  it('lists canonical tools verbatim for gemini instead of mapping them through runtime.tools', () => {
    const agentWithProseMappedTools = [
      '---',
      'name: planner',
      'description: "Planner."',
      'tools: [read_file, read_many_files, write_todos]',
      'max_turns: 10',
      '---',
      '',
      'Body.',
    ].join('\n');
    // gemini's runtime.tools maps these two to prose for the model
    assert.equal(geminiRuntime.tools.read_many_files, 'read_file (called per-file)');
    assert.match(geminiRuntime.tools.write_todos, /^not available/);

    const { frontmatter } = parseDocument(agentStub(agentWithProseMappedTools, geminiRuntime));
    assert.deepEqual(
      frontmatter.filter((line) => line === 'tools:' || line.startsWith('  - ')),
      ['tools:', '  - read_file', '  - read_many_files', '  - write_todos']
    );
  });

  it('explicit tools.<runtime> override beats the native rule', () => {
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
    const { frontmatter } = parseDocument(agentStub(agentWithGeminiOverride, geminiRuntime));
    assert.deepEqual(
      frontmatter.filter((line) => line === 'tools:' || line.startsWith('  - ')),
      ['tools:', '  - read_file', '  - glob', '  - grep_search', '  - google_web_search']
    );
  });
});
