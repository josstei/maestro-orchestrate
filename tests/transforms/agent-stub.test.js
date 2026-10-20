'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const agentStub = require('../../src/transforms/agent-stub');
const { parse } = require('../../src/lib/frontmatter');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');

const SRC_AGENTS_DIR = path.resolve(__dirname, '../../src/agents');

describe('agent-stub transform', () => {
  const canonicalAgent = [
    '---',
    'name: code-reviewer',
    'description: "Code review specialist."',
    'color: blue',
    'tools: [read_file, glob, grep_search]',
    'max_turns: 15',
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
    '---',
    '',
    '<example>',
    'Context: User wants a review.',
    '</example>',
    '',
    '## Methodology',
    'Review code carefully.',
  ].join('\n');

  const antigravityRuntime = getRuntimeConfig('antigravity');
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

  it('produces qwen frontmatter with kind, max_turns before tools and a snake_case stub name', () => {
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

  it('produces antigravity frontmatter with subagent, mainAgent, model and mapped tools, without color or turns', () => {
    const result = agentStub(canonicalAgent, antigravityRuntime);
    assertDocument(
      result,
      [
        'name: code-reviewer',
        'description: "Code review specialist."',
        'subagent: true',
        'mainAgent: false',
        'model: inherit',
        'tools:',
        '  - view_file',
        '  - find_by_name',
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

  it('does not embed example blocks for qwen', () => {
    const result = agentStub(agentWithExamples, qwenRuntime);
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

  it('does not embed example blocks for antigravity', () => {
    const { frontmatter } = parseDocument(agentStub(agentWithExamples, antigravityRuntime));
    assert.ok(frontmatter.includes('description: "Code review specialist."'));
    assert.ok(!frontmatter.some((line) => line.includes('<example>')));
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
    assert.doesNotThrow(() => agentStub(unclosedExample, qwenRuntime));
    assert.doesNotThrow(() => agentStub(unclosedExample, antigravityRuntime));
  });

  it('flattens array tool mappings when no per-runtime override', () => {
    const agentWithArrayTools = [
      '---',
      'name: coder',
      'description: "Coder."',
      'color: green',
      'tools: [read_file, write_todos]',
      'max_turns: 25',
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
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = agentStub(noTurnsAgent, claudeRuntime);
    assert.ok(!result.includes('maxTurns:'));
  });

  describe('legacy temperature and timeout_mins frontmatter', () => {
    const STUB_RUNTIME_NAMES = RUNTIME_NAMES.filter(
      (name) => getRuntimeConfig(name).agentFrontmatter
    );

    it('is only stubbed for the antigravity, claude and qwen runtimes', () => {
      assert.deepEqual(STUB_RUNTIME_NAMES, ['antigravity', 'claude', 'qwen']);
    });

    it('is never emitted into a stub, even when the source still declares it', () => {
      const legacyAgent = [
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

      for (const runtimeName of STUB_RUNTIME_NAMES) {
        const { frontmatter } = parseDocument(agentStub(legacyAgent, getRuntimeConfig(runtimeName)));
        assert.deepEqual(
          frontmatter.filter((line) => /^(temperature|timeout_mins|timeout):/.test(line)),
          [],
          runtimeName
        );
      }
    });

    it('is no longer declared by any canonical agent, nor emitted into its stubs', () => {
      const agentFiles = fs.readdirSync(SRC_AGENTS_DIR).filter((file) => file.endsWith('.md'));
      assert.equal(agentFiles.length, 39);

      for (const file of agentFiles) {
        const content = fs.readFileSync(path.join(SRC_AGENTS_DIR, file), 'utf8');
        const { frontmatter } = parse(content);
        assert.equal(frontmatter.temperature, undefined, `${file}: temperature`);
        assert.equal(frontmatter.timeout_mins, undefined, `${file}: timeout_mins`);

        for (const runtimeName of STUB_RUNTIME_NAMES) {
          const stub = agentStub(content, getRuntimeConfig(runtimeName));
          assert.doesNotMatch(stub, /^(temperature|timeout_mins):/m, `${runtimeName} ${file}`);
        }
      }
    });
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
    const result = agentStub(escapedDesc, qwenRuntime);
    assert.ok(result.includes('description: "Tests things \\"carefully\\". Path: C:\\\\temp\\\\agent"'));
  });

  it('maps canonical tools through runtime.tools for qwen', () => {
    const agentWithMappedTools = [
      '---',
      'name: planner',
      'description: "Planner."',
      'tools: [read_file, read_many_files, replace, write_todos, google_web_search, ask_user, activate_skill]',
      'max_turns: 10',
      '---',
      '',
      'Body.',
    ].join('\n');

    const { frontmatter } = parseDocument(agentStub(agentWithMappedTools, qwenRuntime));
    assert.deepEqual(
      frontmatter.filter((line) => line === 'tools:' || line.startsWith('  - ')),
      [
        'tools:',
        '  - read_file',
        '  - read_many_files',
        '  - edit',
        '  - todo_write',
        '  - web_search',
        '  - ask_user_question',
        '  - skill',
      ]
    );
  });

  it('maps canonical tools to Antigravity tool names, each listed once', () => {
    const agentWithEveryTool = [
      '---',
      'name: builder',
      'description: "Builder."',
      'tools: [read_file, list_directory, glob, grep_search, google_web_search, web_fetch, write_file, replace, run_shell_command, ask_user, read_many_files, write_todos, activate_skill]',
      'max_turns: 25',
      '---',
      '',
      'Body.',
    ].join('\n');

    // read_many_files and activate_skill both map to view_file; write_todos
    // has no Antigravity equivalent.
    const { frontmatter } = parseDocument(agentStub(agentWithEveryTool, antigravityRuntime));
    assert.deepEqual(
      frontmatter.filter((line) => line === 'tools:' || line.startsWith('  - ')),
      [
        'tools:',
        '  - view_file',
        '  - list_dir',
        '  - find_by_name',
        '  - grep_search',
        '  - search_web',
        '  - read_url_content',
        '  - write_to_file',
        '  - replace_file_content',
        '  - run_command',
        '  - ask_question',
      ]
    );
  });

  it('explicit tools.<runtime> override replaces the mapped canonical list', () => {
    const agentWithQwenOverride = [
      '---',
      'name: architect',
      'description: "Architect."',
      'tools: [read_file, replace]',
      'tools.qwen: [read_file, glob, grep_search, web_search]',
      'max_turns: 15',
      '---',
      '',
      'Body.',
    ].join('\n');
    const { frontmatter } = parseDocument(agentStub(agentWithQwenOverride, qwenRuntime));
    assert.deepEqual(
      frontmatter.filter((line) => line === 'tools:' || line.startsWith('  - ')),
      ['tools:', '  - read_file', '  - glob', '  - grep_search', '  - web_search']
    );
  });
});
