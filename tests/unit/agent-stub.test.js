'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { agentStub } = require('../../src/generator/stub-outputs');
const { parse } = require('../../src/lib/frontmatter');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { AGENT_COUNT, listCanonicalAgents } = require('../support/catalog');
const { splitFrontmatter } = require('../support/generated-files');
const { SRC_ROOT } = require('../support/paths');

const antigravityRuntime = getRuntimeConfig('antigravity');
const claudeRuntime = getRuntimeConfig('claude');
const qwenRuntime = getRuntimeConfig('qwen');

// One `key: value` frontmatter line per defined field, then a blank line and the body.
function agentDoc(fields, body = 'Body.') {
  const lines = Object.entries(fields).filter(([, value]) => value !== undefined);
  return ['---', ...lines.map(([key, value]) => `${key}: ${value}`), '---', '', body].join('\n');
}
const tester = (fields) =>
  agentDoc({ name: 'tester', description: '"Tester."', tools: '[read_file]', max_turns: 10, ...fields });
const stub = (content, runtime = claudeRuntime) => splitFrontmatter(agentStub(content, runtime));
const toolLines = (content, runtime) =>
  stub(content, runtime).lines.filter((line) => line === 'tools:' || line.startsWith('  - '));
const stubBody = (name) => '\nAgent methodology loaded via MCP tool `get_agent`. ' +
  `Call \`get_agent(agents: ["${name}"])\` to read the full methodology at delegation time.\n`;

const codeReviewer = {
  name: 'code-reviewer',
  description: '"Code review specialist."',
  color: 'blue',
  tools: '[read_file, glob, grep_search]',
  max_turns: 15,
};
const canonicalAgent = agentDoc(codeReviewer, '## Methodology\nReview code carefully.');
const agentWithExamples = agentDoc(
  codeReviewer,
  '<example>\nContext: User wants a review.\n</example>\n\n## Methodology\nReview code carefully.'
);
const CODE_REVIEWER_FRONTMATTER = {
  claude: ['name: code-reviewer', 'description: "Code review specialist."', 'model: inherit', 'color: blue',
    'maxTurns: 15', 'tools:', '  - Read', '  - Glob', '  - Grep'],
  qwen: ['name: code_reviewer', 'kind: local', 'description: "Code review specialist."', 'max_turns: 15',
    'tools:', '  - read_file', '  - glob', '  - grep_search'],
  antigravity: ['name: code-reviewer', 'description: "Code review specialist."', 'subagent: true', 'mainAgent: false',
    'model: inherit', 'tools:', '  - view_file', '  - find_by_name', '  - grep_search'],
};

describe('agentStub renderer', () => {
  for (const [runtime, lines] of Object.entries(CODE_REVIEWER_FRONTMATTER)) {
    it(`renders the ${runtime} frontmatter and get_agent body`, () => {
      assert.deepEqual(stub(canonicalAgent, getRuntimeConfig(runtime)), { lines, body: stubBody('code-reviewer') });
    });
  }

  it('embeds example blocks into the claude description only', () => {
    const claude = ['name: code-reviewer', 'description: |', '  Code review specialist.', '  ', '  <example>',
      '  Context: User wants a review.', '  </example>', ...CODE_REVIEWER_FRONTMATTER.claude.slice(2)];
    for (const [runtime, lines] of Object.entries({ ...CODE_REVIEWER_FRONTMATTER, claude })) {
      const expected = { lines, body: stubBody('code-reviewer') };
      assert.deepEqual(stub(agentWithExamples, getRuntimeConfig(runtime)), expected, runtime);
    }
  });

  it('embeds multiple example blocks into the claude description', () => {
    const content = agentDoc(
      { name: 'coder', description: '"A coder."', color: 'green', tools: '[read_file]', max_turns: 10 },
      '<example>\nFirst example.\n</example>\n\n<example>\nSecond example.\n</example>\n\n## Body content'
    );
    assert.deepEqual(stub(content), {
      lines: ['name: coder', 'description: |', '  A coder.', '  ', '  <example>', '  First example.', '  </example>',
        '  <example>', '  Second example.', '  </example>', 'model: inherit', 'color: green', 'maxTurns: 10',
        'tools:', '  - Read'],
      body: stubBody('coder'),
    });
  });

  it('throws for a listed frontmatter field that is neither computed nor configured', () => {
    const agentFrontmatter = { ...claudeRuntime.agentFrontmatter, fields: ['name', 'modle'] };
    const runtime = { ...claudeRuntime, agentFrontmatter };
    assert.throws(() => agentStub(canonicalAgent, runtime), {
      message: 'Unknown agent frontmatter field "modle" for claude',
    });
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

  for (const [title, content] of [
    ['treats content with no frontmatter as an agent with no fields', 'Just body content.\nNo frontmatter here.'],
    ['treats unclosed frontmatter (no closing ---) as no frontmatter', '---\nname: test\nno closing fence'],
  ]) {
    it(title, () => {
      assert.deepEqual(stub(content), { lines: ['description: ""', 'model: inherit'], body: stubBody('') });
    });
  }

  for (const [title, content, present, absent = [], runtime = claudeRuntime] of [
    ['uses tools.<runtime> override when present',
      tester({ tools: '[read_file, glob]', 'tools.claude': '[Read, Glob, Grep, WebSearch, WebFetch]' }),
      ['- Read', '- WebFetch']],
    ['flattens array tool mappings when no per-runtime override',
      tester({ tools: '[read_file, write_todos]' }), ['- Read', '- TaskCreate', '- TaskUpdate', '- TaskList']],
    ['keeps a tool that runtime.tools does not map',
      tester({ tools: '[read_file, unknown_tool]' }), ['- unknown_tool', '- Read']],
    ['omits tools for an agent with none', tester({ tools: '[]' }), ['name: tester'], ['tools:']],
    ['omits color when the source declares none', tester(), ['name: tester'], ['color:']],
    ['omits maxTurns when the source declares none', tester({ max_turns: undefined }), [], ['maxTurns:']],
    ['writes an empty description when the source declares none',
      tester({ description: undefined }), ['\ndescription: ""\n']],
    ['quotes a numeric description as its string form',
      tester({ description: 42 }), ['\ndescription: "42"\n'], [], qwenRuntime],
    ['round-trips escaped quotes and literal backslashes in quoted descriptions',
      tester({ description: '"Tests things \\"carefully\\". Path: C:\\\\temp\\\\agent"' }),
      ['description: "Tests things \\"carefully\\". Path: C:\\\\temp\\\\agent"'], [], qwenRuntime],
  ]) {
    it(title, () => {
      const result = agentStub(content, runtime);
      for (const text of present) assert.ok(result.includes(text), text);
      for (const text of absent) assert.ok(!result.includes(text), text);
    });
  }

  describe('legacy temperature and timeout_mins frontmatter', () => {
    const STUB_RUNTIME_NAMES = RUNTIME_NAMES.filter(
      (name) => getRuntimeConfig(name).agentFrontmatter
    );

    it('is only stubbed for the antigravity, claude and qwen runtimes', () => {
      assert.deepEqual(STUB_RUNTIME_NAMES, ['antigravity', 'claude', 'qwen']);
    });

    it('is never emitted into a stub, even when the source still declares it', () => {
      const legacyAgent = tester({ temperature: 0.3, timeout_mins: 5 });

      for (const runtimeName of STUB_RUNTIME_NAMES) {
        const { lines } = stub(legacyAgent, getRuntimeConfig(runtimeName));
        assert.deepEqual(
          lines.filter((line) => /^(temperature|timeout_mins|timeout):/.test(line)),
          [],
          runtimeName
        );
      }
    });

    it('is no longer declared by any canonical agent, nor emitted into its stubs', () => {
      const agentFiles = listCanonicalAgents().map((name) => `${name}.md`);
      assert.equal(agentFiles.length, AGENT_COUNT);

      for (const file of agentFiles) {
        const content = fs.readFileSync(path.join(SRC_ROOT, 'agents', file), 'utf8');
        const { frontmatter } = parse(content);
        assert.equal(frontmatter.temperature, undefined, `${file}: temperature`);
        assert.equal(frontmatter.timeout_mins, undefined, `${file}: timeout_mins`);

        for (const runtimeName of STUB_RUNTIME_NAMES) {
          const result = agentStub(content, getRuntimeConfig(runtimeName));
          assert.doesNotMatch(result, /^(temperature|timeout_mins):/m, `${runtimeName} ${file}`);
        }
      }
    });
  });

  for (const [title, tools, runtime, expected] of [
    ['maps canonical tools through runtime.tools for qwen',
      { tools: '[read_file, read_many_files, replace, write_todos, google_web_search, ask_user, activate_skill]' },
      qwenRuntime,
      ['read_file', 'read_many_files', 'edit', 'todo_write', 'web_search', 'ask_user_question', 'skill']],
    // read_many_files and activate_skill both map to view_file; Antigravity has no write_todos.
    ['maps canonical tools to Antigravity tool names, each listed once',
      { tools: '[read_file, list_directory, glob, grep_search, google_web_search, web_fetch, write_file, replace, ' +
        'run_shell_command, ask_user, read_many_files, write_todos, activate_skill]' },
      antigravityRuntime,
      ['view_file', 'list_dir', 'find_by_name', 'grep_search', 'search_web', 'read_url_content', 'write_to_file',
        'replace_file_content', 'run_command', 'ask_question']],
    ['explicit tools.<runtime> override replaces the mapped canonical list',
      { tools: '[read_file, replace]', 'tools.qwen': '[read_file, glob, grep_search, web_search]' },
      qwenRuntime,
      ['read_file', 'glob', 'grep_search', 'web_search']],
  ]) {
    it(title, () => {
      assert.deepEqual(toolLines(tester(tools), runtime), ['tools:', ...expected.map((tool) => `  - ${tool}`)]);
    });
  }
});
