'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createHandler: createSkillContentHandler } = require('../../src/mcp/handlers/get-skill-content');
const { createHandler: createAgentHandler } = require('../../src/mcp/handlers/get-agent');
const { getRuntimeConfig } = require('../../src/mcp/runtime/runtime-config-map');
const { writeAgentFixture } = require('../support/agent-fixtures');
const { makeTempDir } = require('../support/fs');

describe('get_skill_content handler', () => {
  it('reads canonical src content and applies skill transforms', () => {
    const root = makeTempDir('maestro-skill-content-');
    const skillDir = path.join(root, 'src', 'skills', 'shared', 'delegation');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: delegation\ndescription: Demo skill\n---\nUse ${extensionPath} here.\n',
      'utf8'
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
    const refDir = path.join(root, 'src', 'references');
    fs.mkdirSync(refDir, { recursive: true });
    fs.writeFileSync(
      path.join(refDir, 'architecture.md'),
      [
        '<!-- @feature scriptBasedStateContract -->',
        'Qwen uses ${extensionPath} and code-reviewer.',
        '<!-- @end-feature -->',
        '<!-- @feature codexStateContract -->',
        'Codex keeps code-reviewer.',
        '<!-- @end-feature -->',
      ].join('\n'),
      'utf8'
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

  it('applies agent-name replacement to delegation skill for snake_case runtimes', () => {
    const root = makeTempDir('maestro-delegation-names-');
    const skillDir = path.join(root, 'src', 'skills', 'shared', 'delegation');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: delegation\ndescription: test\n---\nDelegate to `code-reviewer` and `ux-designer`.\n',
      'utf8'
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
        '<!-- @feature exampleBlocks -->',
        'Example block',
        '<!-- @end-feature -->',
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
