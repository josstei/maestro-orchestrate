'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { RuntimeContent } = require('../../src/mcp/content/runtime-content');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { writeAgentFixture } = require('../support/agent-fixtures');
const { makeTempDir, writeTree } = require('../support/fs');
const { SRC_ROOT } = require('../support/paths');

/** A fake canonical src/ root, populated by `write(src)`. */
function fakeSrc(write) {
  const src = path.join(makeTempDir('maestro-content-'), 'src');
  write(src);
  return src;
}

const skill = (config, src, resource) =>
  new RuntimeContent(config, src).getSkillContent({ resources: [resource] }).contents[resource];
const agents = (config, src, name) => new RuntimeContent(config, src).getAgent({ agents: [name] });

describe('get_skill_content handler', () => {
  it('reads canonical src content and applies skill transforms', () => {
    const src = fakeSrc((root) => writeTree(
      root,
      'skills/shared/delegation/SKILL.md',
      '---\nname: delegation\ndescription: Demo skill\n---\nUse ${extensionPath} here.\n'
    ));
    const result = new RuntimeContent(getRuntimeConfig('claude'), src).getSkillContent({ resources: ['delegation'] });

    assert.ok(result.contents.delegation.includes('${CLAUDE_PLUGIN_ROOT}'));
    assert.ok(result.contents.delegation.includes('user-invocable: false'));
    assert.deepEqual(result.errors, {});
  });

  it('applies architecture feature stripping and agent-name replacement', () => {
    const src = fakeSrc((root) => writeTree(root, 'references/architecture.md', [
      '<!-- @feature scriptBasedStateContract -->',
      'Qwen uses ${extensionPath} and code-reviewer.',
      '<!-- @end-feature -->',
      '<!-- @feature codexStateContract -->',
      'Codex keeps code-reviewer.',
      '<!-- @end-feature -->',
    ].join('\n')));
    const qwen = { ...getRuntimeConfig('qwen'), env: { extensionPath: 'PLUGIN_ROOT' } };
    const content = skill(qwen, src, 'architecture');

    assert.ok(content.includes('Qwen uses ${PLUGIN_ROOT} and code_reviewer.'));
    assert.ok(!content.includes('code-reviewer'));
    assert.ok(!content.includes('Codex keeps'));
  });

  for (const [runtime, ensureWorkspace] of [
    ['antigravity', '`node ${PLUGIN_ROOT}/src/scripts/ensure-workspace.js <state_dir>`'],
    ['claude', '`node ${CLAUDE_PLUGIN_ROOT}/src/scripts/ensure-workspace.js <state_dir>`'],
    ['codex', '`node "<absolute-plugin-root>/src/scripts/ensure-workspace.js" <state_dir>`'],
  ]) {
    it(`serves ${runtime} a state contract rooted at <state_dir> with its own script paths`, () => {
      const content = skill(getRuntimeConfig(runtime), SRC_ROOT, 'architecture');

      assert.ok(content.includes('Maestro maintains session state under `<state_dir>` (resolved from `MAESTRO_STATE_DIR`)'));
      assert.ok(content.includes(ensureWorkspace));
      assert.ok(!content.includes('docs/maestro/'), 'state paths should be rooted at <state_dir>');
      assert.ok(!content.includes('${extensionPath}'));
    });
  }

  it('serves every runtime a delegation skill that explains its result surface', () => {
    for (const runtimeName of RUNTIME_NAMES) {
      const runtimeConfig = getRuntimeConfig(runtimeName);
      assert.ok(
        skill(runtimeConfig, SRC_ROOT, 'delegation')
          .includes(`\`result_surface: "${runtimeConfig.delegation.constraints.result_surface}"\``),
        `${runtimeName}: delegation skill does not explain its result surface`
      );
    }
    // Antigravity has no post-delegation hook, so the orchestrator validates handoffs.
    assert.ok(
      skill(getRuntimeConfig('antigravity'), SRC_ROOT, 'delegation')
        .includes('Antigravity runs no post-delegation hook')
    );
  });

  it('applies agent-name replacement to delegation skill for snake_case runtimes', () => {
    const src = fakeSrc((root) => writeTree(
      root,
      'skills/shared/delegation/SKILL.md',
      '---\nname: delegation\ndescription: test\n---\nDelegate to `code-reviewer` and `ux-designer`.\n'
    ));
    const content = skill(getRuntimeConfig('qwen'), src, 'delegation');

    assert.ok(content.includes('code_reviewer'), 'code-reviewer should be replaced with code_reviewer');
    assert.ok(content.includes('ux_designer'), 'ux-designer should be replaced with ux_designer');
    assert.ok(!content.includes('code-reviewer'), 'kebab-case should not remain');
    assert.ok(!content.includes('ux-designer'), 'kebab-case should not remain');
  });
});

describe('get_agent handler', () => {
  it('returns methodology bodies and runtime-mapped tools, keeping example blocks only where enabled', () => {
    const src = fakeSrc((root) => writeAgentFixture(root, 'coder', [
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
    ].join('\n')));
    const claude = getRuntimeConfig('claude');
    const result = agents({ ...claude, features: { ...claude.features, exampleBlocks: false } }, src, 'coder');

    assert.deepEqual(result.errors, {});
    assert.deepEqual(result.agents.coder.tools, ['Read', 'Write']);
    assert.ok(result.agents.coder.body.includes('Methodology body.'));
    assert.ok(!result.agents.coder.body.includes('tools:'));
    assert.ok(!result.agents.coder.body.includes('Example block'));

    const kept = agents(claude, src, 'coder');
    assert.ok(kept.agents.coder.body.includes('<example>\nExample block\n</example>'));
  });

  it('returns tool_name matching runtime agentNaming convention', () => {
    const src = fakeSrc((root) => writeAgentFixture(root, 'code-reviewer', [
      '---',
      'name: code-reviewer',
      'tools: [read_file]',
      '---',
      '',
      'Review methodology.',
    ].join('\n')));

    // Qwen dispatches snake_case agent names; Claude keeps kebab-case.
    for (const [runtime, toolName] of [['qwen', 'code_reviewer'], ['claude', 'code-reviewer']]) {
      const result = agents(getRuntimeConfig(runtime), src, 'code-reviewer');
      assert.equal(result.agents['code-reviewer'].tool_name, toolName, `${runtime} tool_name`);
    }
  });

  it('returns the bare agent name and deduplicated Antigravity tools for coder', () => {
    const result = agents(getRuntimeConfig('antigravity'), SRC_ROOT, 'coder');

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
    const src = fakeSrc((root) => writeAgentFixture(root, 'ux-designer', [
      '---',
      'name: ux-designer',
      'tools: [read_file, write_file, replace]',
      '---',
      '',
      'UX Designer methodology.',
    ].join('\n')));

    // A snake_case orchestrator calls with the agent name from the plan.
    const result = agents(getRuntimeConfig('qwen'), src, 'ux_designer');

    assert.deepEqual(result.errors, {});
    // Keyed by the requested name, with the Qwen dispatch name and Qwen tools (replace -> edit).
    const agent = result.agents.ux_designer;
    assert.ok(agent, 'agent should be returned keyed by ux_designer');
    assert.ok(agent.body.includes('UX Designer methodology.'));
    assert.equal(agent.tool_name, 'ux_designer');
    assert.deepEqual(agent.tools, ['read_file', 'write_file', 'edit']);
  });
});
