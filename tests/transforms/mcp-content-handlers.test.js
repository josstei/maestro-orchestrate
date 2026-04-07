const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createHandler: createSkillContentHandler } = require('../../src/lib/mcp/handlers/get-skill-content');
const { createHandler: createAgentHandler } = require('../../src/lib/mcp/handlers/get-agent');
const { createHandler: createPackagedSkillContentHandler } = require('../../plugins/maestro/lib/mcp/handlers/get-skill-content');
const { createHandler: createPackagedAgentHandler } = require('../../plugins/maestro/lib/mcp/handlers/get-agent');
const { getRuntimeConfig } = require('../../src/lib/mcp/runtime/runtime-config-map');

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

    const handler = createSkillContentHandler(getRuntimeConfig('claude'), 'src');

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
        '<!-- @feature geminiStateContract -->',
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
    }, 'src');

    const result = withExtensionRoot(root, () => handler({ resources: ['architecture'] }));
    const content = result.contents.architecture;

    assert.ok(content.includes('${PLUGIN_ROOT}'));
    assert.ok(content.includes('code_reviewer'));
    assert.ok(!content.includes('Codex keeps'));
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
    }, 'src');

    const result = withExtensionRoot(root, () => handler({ agents: ['coder'] }));

    assert.deepEqual(result.errors, {});
    assert.deepEqual(result.agents.coder.tools, ['Read', 'Write']);
    assert.ok(result.agents.coder.body.includes('Methodology body.'));
    assert.ok(!result.agents.coder.body.includes('tools:'));
    assert.ok(!result.agents.coder.body.includes('Example block'));
  });
});

describe('codex plugin bundle content handlers', () => {
  it('reads canonical shared content from the generated codex plugin bundle', () => {
    const pluginRoot = path.resolve(__dirname, '../..', 'plugins', 'maestro');
    const handler = createPackagedSkillContentHandler();

    const result = withExtensionRoot(pluginRoot, () =>
      handler({ resources: ['delegation', 'architecture', 'orchestration-steps'] })
    );

    assert.deepEqual(result.errors, {});
    assert.ok(result.contents.delegation.includes('# Delegation Skill'));
    assert.ok(result.contents.architecture.includes('workspace root'));
    assert.ok(result.contents['orchestration-steps'].includes('STARTUP'));
  });

  it('reads canonical agent methodology from the generated codex plugin bundle', () => {
    const pluginRoot = path.resolve(__dirname, '../..', 'plugins', 'maestro');
    const handler = createPackagedAgentHandler();

    const result = withExtensionRoot(pluginRoot, () =>
      handler({ agents: ['coder'] })
    );

    assert.deepEqual(result.errors, {});
    assert.ok(result.agents.coder.body.includes('Senior Software Engineer'));
    assert.ok(!result.agents.coder.body.includes('Agent methodology loaded via MCP'));
  });
});
