'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createHandler: createSkillContentHandler } = require('../../src/mcp/handlers/get-skill-content');
const { createHandler: createAgentHandler } = require('../../src/mcp/handlers/get-agent');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { writeAgentFixture } = require('../support/agent-fixtures');
const { makeTempDir, writeTree } = require('../support/fs');
const { SRC_ROOT } = require('../support/paths');

describe('get_skill_content handler', () => {
  it('reads canonical src content and applies skill transforms', () => {
    const root = makeTempDir('maestro-skill-content-');
    writeTree(
      root,
      'src/skills/shared/delegation/SKILL.md',
      '---\nname: delegation\ndescription: Demo skill\n---\nUse ${extensionPath} here.\n'
    );

    const handler = createSkillContentHandler(getRuntimeConfig('claude'), path.join(root, 'src'));

    const result = handler({ resources: ['delegation'] });
    const content = result.contents.delegation;

    assert.ok(content.includes('${CLAUDE_PLUGIN_ROOT}'));
    assert.ok(content.includes('user-invocable: false'));
    assert.deepEqual(result.errors, {});
  });

  it('applies architecture feature stripping and agent-name replacement', () => {
    const root = makeTempDir('maestro-architecture-');
    writeTree(
      root,
      'src/references/architecture.md',
      [
        '<!-- @feature scriptBasedStateContract -->',
        'Qwen uses ${extensionPath} and code-reviewer.',
        '<!-- @end-feature -->',
        '<!-- @feature codexStateContract -->',
        'Codex keeps code-reviewer.',
        '<!-- @end-feature -->',
      ].join('\n')
    );

    const handler = createSkillContentHandler({
      ...getRuntimeConfig('qwen'),
      env: { extensionPath: 'PLUGIN_ROOT' },
    }, path.join(root, 'src'));

    const result = handler({ resources: ['architecture'] });
    const content = result.contents.architecture;

    assert.ok(content.includes('Qwen uses ${PLUGIN_ROOT} and code_reviewer.'));
    assert.ok(!content.includes('code-reviewer'));
    assert.ok(!content.includes('Codex keeps'));
  });

  it('serves antigravity the script-based state contract rooted at ${PLUGIN_ROOT}', () => {
    const handler = createSkillContentHandler(getRuntimeConfig('antigravity'), SRC_ROOT);

    const content = handler({ resources: ['architecture'] }).contents.architecture;

    assert.ok(content.includes('Maestro maintains session state under `<state_dir>`'));
    assert.ok(content.includes('`node ${PLUGIN_ROOT}/src/scripts/ensure-workspace.js <state_dir>`'));
    assert.ok(!content.includes('${extensionPath}'));
    assert.ok(!content.includes('${CLAUDE_PLUGIN_ROOT}'));
    assert.ok(!content.includes('node ./src/scripts/'));
  });

  it('serves claude the script-based state contract rooted at ${CLAUDE_PLUGIN_ROOT}', () => {
    const handler = createSkillContentHandler(getRuntimeConfig('claude'), SRC_ROOT);

    const content = handler({ resources: ['architecture'] }).contents.architecture;

    assert.ok(content.includes('Maestro maintains session state under `<state_dir>`'));
    assert.ok(content.includes('`node ${CLAUDE_PLUGIN_ROOT}/src/scripts/ensure-workspace.js <state_dir>`'));
    assert.ok(!content.includes('${extensionPath}'));
    assert.ok(!content.includes('docs/maestro'));
  });

  it('serves codex a <state_dir> contract that names docs/maestro only as the default', () => {
    const handler = createSkillContentHandler(getRuntimeConfig('codex'), SRC_ROOT);

    const content = handler({ resources: ['architecture'] }).contents.architecture;

    assert.ok(content.includes('Maestro maintains session state under `<state_dir>`'));
    assert.ok(content.includes('`<state_dir>` is relative to the workspace root and defaults to `docs/maestro`.'));
    assert.ok(content.includes('`read-setting.js MAESTRO_STATE_DIR`'));
    assert.ok(content.includes('`node "<absolute-plugin-root>/src/scripts/ensure-workspace.js" <state_dir>`'));
    assert.ok(content.includes('derive the absolute installed plugin root from the path of the loaded Maestro skill'));
    assert.ok(!content.includes('docs/maestro/'), 'state paths should be rooted at <state_dir>');
    assert.ok(!content.includes('under `docs/maestro`'));
    assert.ok(!content.includes('${extensionPath}'));
  });

  it('serves every runtime a delegation skill that explains its result surface', () => {
    for (const runtimeName of RUNTIME_NAMES) {
      const runtimeConfig = getRuntimeConfig(runtimeName);
      const handler = createSkillContentHandler(runtimeConfig, SRC_ROOT);

      const content = handler({ resources: ['delegation'] }).contents.delegation;

      assert.ok(
        content.includes(`\`result_surface: "${runtimeConfig.delegation.constraints.result_surface}"\``),
        `${runtimeName}: delegation skill does not explain its result surface`
      );
    }
    // Antigravity has no post-delegation hook, so the orchestrator validates handoffs.
    const antigravity = createSkillContentHandler(getRuntimeConfig('antigravity'), SRC_ROOT);
    assert.ok(
      antigravity({ resources: ['delegation'] }).contents.delegation
        .includes('Antigravity runs no post-delegation hook')
    );
  });

  it('applies agent-name replacement to delegation skill for snake_case runtimes', () => {
    const root = makeTempDir('maestro-delegation-names-');
    writeTree(
      root,
      'src/skills/shared/delegation/SKILL.md',
      '---\nname: delegation\ndescription: test\n---\nDelegate to `code-reviewer` and `ux-designer`.\n'
    );

    const handler = createSkillContentHandler(
      getRuntimeConfig('qwen'),
      path.join(root, 'src')
    );

    const result = handler({ resources: ['delegation'] });
    const content = result.contents.delegation;

    assert.ok(content.includes('code_reviewer'), 'code-reviewer should be replaced with code_reviewer');
    assert.ok(content.includes('ux_designer'), 'ux-designer should be replaced with ux_designer');
    assert.ok(!content.includes('code-reviewer'), 'kebab-case should not remain');
    assert.ok(!content.includes('ux-designer'), 'kebab-case should not remain');
  });
});

describe('get_agent handler', () => {
  it('returns stripped methodology bodies and runtime-mapped tools', () => {
    const root = makeTempDir('maestro-agent-content-');
    writeAgentFixture(
      path.join(root, 'src'),
      'coder',
      [
        '---',
        'name: coder',
        'tools: [read_file, write_file]',
        'tools.claude: [Read, Write]',
        '---',
        '<example>',
        'Example block',
        '</example>',
        '',
        'Methodology body.',
      ].join('\n')
    );

    const handler = createAgentHandler({
      ...getRuntimeConfig('claude'),
      features: {
        ...getRuntimeConfig('claude').features,
        exampleBlocks: false,
      },
    }, path.join(root, 'src'));

    const result = handler({ agents: ['coder'] });

    assert.deepEqual(result.errors, {});
    assert.deepEqual(result.agents.coder.tools, ['Read', 'Write']);
    assert.ok(result.agents.coder.body.includes('Methodology body.'));
    assert.ok(!result.agents.coder.body.includes('tools:'));
    assert.ok(!result.agents.coder.body.includes('Example block'));
  });

  it('keeps example blocks for runtimes with exampleBlocks enabled', () => {
    const root = makeTempDir('maestro-agent-examples-');
    writeAgentFixture(
      path.join(root, 'src'),
      'coder',
      ['---', 'name: coder', '---', '<example>', 'Example block', '</example>', '', 'Methodology body.'].join('\n')
    );

    const handler = createAgentHandler(getRuntimeConfig('claude'), path.join(root, 'src'));
    const result = handler({ agents: ['coder'] });

    assert.deepEqual(result.errors, {});
    assert.ok(result.agents.coder.body.includes('<example>\nExample block\n</example>'));
    assert.ok(result.agents.coder.body.includes('Methodology body.'));
  });

  it('returns tool_name matching runtime agentNaming convention', () => {
    const root = makeTempDir('maestro-agent-toolname-');
    writeAgentFixture(
      path.join(root, 'src'),
      'code-reviewer',
      [
        '---',
        'name: code-reviewer',
        'tools: [read_file]',
        '---',
        '',
        'Review methodology.',
      ].join('\n')
    );

    // Qwen runtime: agentNaming is 'snake_case'
    const qwenHandler = createAgentHandler(
      getRuntimeConfig('qwen'),
      path.join(root, 'src')
    );
    const qwenResult = qwenHandler({ agents: ['code-reviewer'] });

    assert.equal(
      qwenResult.agents['code-reviewer'].tool_name,
      'code_reviewer',
      'Qwen tool_name should be snake_case'
    );

    // Claude runtime: agentNaming is 'kebab-case'
    const claudeHandler = createAgentHandler(
      getRuntimeConfig('claude'),
      path.join(root, 'src')
    );
    const claudeResult = claudeHandler({ agents: ['code-reviewer'] });

    assert.equal(
      claudeResult.agents['code-reviewer'].tool_name,
      'code-reviewer',
      'Claude tool_name should be kebab-case'
    );
  });

  it('returns the bare agent name and deduplicated Antigravity tools for coder', () => {
    const handler = createAgentHandler(getRuntimeConfig('antigravity'), SRC_ROOT);

    const result = handler({ agents: ['coder'] });

    assert.deepEqual(result.errors, {});
    assert.equal(result.agents.coder.tool_name, 'coder');
    // read_file, read_many_files and activate_skill all map to view_file, and
    // write_todos has no Antigravity equivalent.
    assert.deepEqual(result.agents.coder.tools, [
      'view_file',
      'list_dir',
      'find_by_name',
      'grep_search',
      'write_to_file',
      'replace_file_content',
      'run_command',
      'ask_question',
    ]);
  });

  it('replays a snake_case ux_designer delegation scenario end-to-end on qwen', () => {
    const root = makeTempDir('maestro-replay-');
    writeAgentFixture(
      path.join(root, 'src'),
      'ux-designer',
      [
        '---',
        'name: ux-designer',
        'tools: [read_file, write_file, replace]',
        '---',
        '',
        'UX Designer methodology.',
      ].join('\n')
    );

    const handler = createAgentHandler(
      getRuntimeConfig('qwen'),
      path.join(root, 'src')
    );

    // Simulate a snake_case orchestrator calling with the agent name from the plan
    const result = handler({ agents: ['ux_designer'] });

    // Should succeed (not error like the original bug)
    assert.deepEqual(result.errors, {});

    // Response keyed by original input
    const agent = result.agents.ux_designer;
    assert.ok(agent, 'agent should be returned keyed by ux_designer');
    assert.ok(agent.body.includes('UX Designer methodology.'));

    // tool_name should be the Qwen dispatch name
    assert.equal(agent.tool_name, 'ux_designer');

    // Tools should be runtime-mapped for Qwen (replace -> edit)
    assert.deepEqual(agent.tools, ['read_file', 'write_file', 'edit']);
  });
});
