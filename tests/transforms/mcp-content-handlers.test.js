const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createHandler: createSkillContentHandler } = require('../../src/mcp/handlers/get-skill-content');
const { createHandler: createAgentHandler } = require('../../src/mcp/handlers/get-agent');
const { getRuntimeConfig } = require('../../src/mcp/runtime/runtime-config-map');

function withExtensionRoot(root, fn) {
  const previous = process.env.MAESTRO_EXTENSION_PATH;
  process.env.MAESTRO_EXTENSION_PATH = root;
  try {
    return fn();
  } finally {
    if (previous == null) {
      delete process.env.MAESTRO_EXTENSION_PATH;
    } else {
      process.env.MAESTRO_EXTENSION_PATH = previous;
    }
  }
}

describe('get_skill_content handler', () => {
  it('reads canonical src content and applies skill transforms', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-skill-content-'));
    const skillDir = path.join(root, 'src', 'skills', 'shared', 'delegation');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: delegation\ndescription: Demo skill\n---\nUse ${extensionPath} here.\n',
      'utf8'
    );

    const handler = createSkillContentHandler(getRuntimeConfig('claude'), path.join(root, 'src'));

    const result = withExtensionRoot(root, () => handler({ resources: ['delegation'] }));
    const content = result.contents.delegation;

    assert.ok(content.includes('${CLAUDE_PLUGIN_ROOT}'));
    assert.ok(content.includes('user-invocable: false'));
    assert.deepEqual(result.errors, {});
  });

  it('applies architecture feature stripping and agent-name replacement', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-architecture-'));
    const refDir = path.join(root, 'src', 'references');
    fs.mkdirSync(refDir, { recursive: true });
    fs.writeFileSync(
      path.join(refDir, 'architecture.md'),
      [
        '<!-- @feature scriptBasedStateContract -->',
        'Gemini uses ${extensionPath} and code-reviewer.',
        '<!-- @end-feature -->',
        '<!-- @feature codexStateContract -->',
        'Codex keeps code-reviewer.',
        '<!-- @end-feature -->',
      ].join('\n'),
      'utf8'
    );

    const handler = createSkillContentHandler({
      ...getRuntimeConfig('gemini'),
      env: { extensionPath: 'PLUGIN_ROOT' },
    }, path.join(root, 'src'));

    const result = withExtensionRoot(root, () => handler({ resources: ['architecture'] }));
    const content = result.contents.architecture;

    assert.ok(content.includes('${PLUGIN_ROOT}'));
    assert.ok(content.includes('code_reviewer'));
    assert.ok(!content.includes('Codex keeps'));
  });

  it('applies agent-name replacement to delegation skill for snake_case runtimes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-delegation-names-'));
    const skillDir = path.join(root, 'src', 'skills', 'shared', 'delegation');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: delegation\ndescription: test\n---\nDelegate to `code-reviewer` and `ux-designer`.\n',
      'utf8'
    );

    const handler = createSkillContentHandler(
      getRuntimeConfig('gemini'),
      path.join(root, 'src')
    );

    const result = withExtensionRoot(root, () =>
      handler({ resources: ['delegation'] })
    );
    const content = result.contents.delegation;

    assert.ok(content.includes('code_reviewer'), 'code-reviewer should be replaced with code_reviewer');
    assert.ok(content.includes('ux_designer'), 'ux-designer should be replaced with ux_designer');
    assert.ok(!content.includes('code-reviewer'), 'kebab-case should not remain');
    assert.ok(!content.includes('ux-designer'), 'kebab-case should not remain');
  });
});

describe('get_agent handler', () => {
  it('returns stripped methodology bodies and runtime-mapped tools', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-agent-content-'));
    const agentDir = path.join(root, 'src', 'agents');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, 'coder.md'),
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
      ].join('\n'),
      'utf8'
    );

    const handler = createAgentHandler({
      ...getRuntimeConfig('claude'),
      features: {
        ...getRuntimeConfig('claude').features,
        exampleBlocks: false,
      },
    }, path.join(root, 'src'));

    const result = withExtensionRoot(root, () => handler({ agents: ['coder'] }));

    assert.deepEqual(result.errors, {});
    assert.deepEqual(result.agents.coder.tools, ['Read', 'Write']);
    assert.ok(result.agents.coder.body.includes('Methodology body.'));
    assert.ok(!result.agents.coder.body.includes('tools:'));
    assert.ok(!result.agents.coder.body.includes('Example block'));
  });

  it('accepts snake_case agent names and normalizes to kebab-case for lookup', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-agent-snake-'));
    const agentDir = path.join(root, 'src', 'agents');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, 'ux-designer.md'),
      [
        '---',
        'name: ux-designer',
        'tools: [read_file, write_file]',
        '---',
        '',
        'UX methodology body.',
      ].join('\n'),
      'utf8'
    );

    const handler = createAgentHandler(
      getRuntimeConfig('gemini'),
      path.join(root, 'src')
    );

    const result = withExtensionRoot(root, () =>
      handler({ agents: ['ux_designer'] })
    );

    assert.deepEqual(result.errors, {});
    assert.ok(result.agents.ux_designer, 'response keyed by original input name');
    assert.ok(result.agents.ux_designer.body.includes('UX methodology body.'));
  });

  it('returns tool_name matching runtime agentNaming convention', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-agent-toolname-'));
    const agentDir = path.join(root, 'src', 'agents');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, 'code-reviewer.md'),
      [
        '---',
        'name: code-reviewer',
        'tools: [read_file]',
        '---',
        '',
        'Review methodology.',
      ].join('\n'),
      'utf8'
    );

    // Gemini runtime: agentNaming is 'snake_case'
    const geminiHandler = createAgentHandler(
      getRuntimeConfig('gemini'),
      path.join(root, 'src')
    );
    const geminiResult = withExtensionRoot(root, () =>
      geminiHandler({ agents: ['code-reviewer'] })
    );

    assert.equal(
      geminiResult.agents['code-reviewer'].tool_name,
      'code_reviewer',
      'Gemini tool_name should be snake_case'
    );

    // Claude runtime: agentNaming is 'kebab-case'
    const claudeHandler = createAgentHandler(
      getRuntimeConfig('claude'),
      path.join(root, 'src')
    );
    const claudeResult = withExtensionRoot(root, () =>
      claudeHandler({ agents: ['code-reviewer'] })
    );

    assert.equal(
      claudeResult.agents['code-reviewer'].tool_name,
      'code-reviewer',
      'Claude tool_name should be kebab-case'
    );
  });

  it('returns correct tool_name when input is snake_case', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-agent-snaketool-'));
    const agentDir = path.join(root, 'src', 'agents');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, 'ux-designer.md'),
      [
        '---',
        'name: ux-designer',
        'tools: [read_file]',
        '---',
        '',
        'UX body.',
      ].join('\n'),
      'utf8'
    );

    const handler = createAgentHandler(
      getRuntimeConfig('gemini'),
      path.join(root, 'src')
    );

    const result = withExtensionRoot(root, () =>
      handler({ agents: ['ux_designer'] })
    );

    assert.equal(
      result.agents.ux_designer.tool_name,
      'ux_designer',
      'tool_name for snake_case input on Gemini should be snake_case'
    );
  });

  it('replays Gemini ux_designer delegation scenario end-to-end', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-replay-'));
    const agentDir = path.join(root, 'src', 'agents');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, 'ux-designer.md'),
      [
        '---',
        'name: ux-designer',
        'tools: [read_file, write_file, replace]',
        '---',
        '',
        'UX Designer methodology.',
      ].join('\n'),
      'utf8'
    );

    const handler = createAgentHandler(
      getRuntimeConfig('gemini'),
      path.join(root, 'src')
    );

    // Simulate what the Gemini orchestrator did: called with snake_case from plan
    const result = withExtensionRoot(root, () =>
      handler({ agents: ['ux_designer'] })
    );

    // Should succeed (not error like the original bug)
    assert.deepEqual(result.errors, {});

    // Response keyed by original input
    const agent = result.agents.ux_designer;
    assert.ok(agent, 'agent should be returned keyed by ux_designer');
    assert.ok(agent.body.includes('UX Designer methodology.'));

    // tool_name should be the Gemini dispatch name
    assert.equal(agent.tool_name, 'ux_designer');

    // Tools should be runtime-mapped for Gemini
    assert.deepEqual(agent.tools, ['read_file', 'write_file', 'replace']);
  });
});
