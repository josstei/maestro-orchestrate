'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_RUNTIME_NAME,
  RESOURCE_ALLOWLIST,
  AGENT_ALLOWLIST,
  applyReplacePaths,
  applySkillMetadata,
  applyReplaceAgentNames,
  applyStripFeature,
  stripFrontmatter,
  stripFeatureBlocks,
  parseInlineArray,
  parseFrontmatter,
  mapTools,
} = require('../../src/mcp/content/runtime-content');

describe('DEFAULT_RUNTIME_NAME', () => {
  it('equals gemini', () => {
    assert.equal(DEFAULT_RUNTIME_NAME, 'gemini');
  });
});

describe('RESOURCE_ALLOWLIST', () => {
  it('is frozen with 14 entries', () => {
    assert.equal(Object.isFrozen(RESOURCE_ALLOWLIST), true);
    assert.equal(Object.keys(RESOURCE_ALLOWLIST).length, 14);
  });
});

describe('AGENT_ALLOWLIST', () => {
  it('is frozen with 39 entries, all kebab-case strings', () => {
    assert.equal(Object.isFrozen(AGENT_ALLOWLIST), true);
    assert.equal(AGENT_ALLOWLIST.length, 39);

    for (const name of AGENT_ALLOWLIST) {
      assert.equal(typeof name, 'string');
      assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('applyReplacePaths', () => {
  it('replaces ${extensionPath} with ${ENV_VAR_NAME} from runtimeConfig.env.extensionPath', () => {
    const content = 'load from ${extensionPath}/foo';
    const result = applyReplacePaths(content, { env: { extensionPath: 'EXTENSION_DIR' } });
    assert.equal(result, 'load from ${EXTENSION_DIR}/foo');
  });

  it('replaces ${workspacePath} with ${ENV_VAR_NAME} from runtimeConfig.env.workspacePath', () => {
    const content = 'root is ${workspacePath}/bar';
    const result = applyReplacePaths(content, { env: { workspacePath: 'WORKSPACE_DIR' } });
    assert.equal(result, 'root is ${WORKSPACE_DIR}/bar');
  });

  it('passes through extensionPath that already starts with ${ as-is', () => {
    const content = 'path is ${extensionPath}/baz';
    const result = applyReplacePaths(content, { env: { extensionPath: '${ALREADY_WRAPPED}' } });
    assert.equal(result, 'path is ${ALREADY_WRAPPED}/baz');
  });

  it('returns content unchanged when no placeholders present', () => {
    const content = 'no placeholders here';
    const result = applyReplacePaths(content, { env: { extensionPath: 'EXT', workspacePath: 'WS' } });
    assert.equal(result, content);
  });
});

describe('applySkillMetadata', () => {
  it('adds user-invocable: false for claude runtime and SKILL.md path', () => {
    const content = '---\nname: delegation\n---\nbody text\n';
    const result = applySkillMetadata(content, { name: 'claude' }, 'skills/shared/delegation/SKILL.md');
    assert.ok(result.includes('user-invocable: false'));
  });

  it('returns unchanged for non-claude runtimes', () => {
    const content = '---\nname: delegation\n---\nbody text\n';
    const result = applySkillMetadata(content, { name: 'gemini' }, 'skills/shared/delegation/SKILL.md');
    assert.equal(result, content);
  });

  it('returns unchanged for non-SKILL.md paths', () => {
    const content = '---\nname: delegation\n---\nbody text\n';
    const result = applySkillMetadata(content, { name: 'claude' }, 'references/architecture.md');
    assert.equal(result, content);
  });
});

describe('applyReplaceAgentNames', () => {
  it('replaces kebab-case agent names with snake_case for snake_case runtime', () => {
    const content = 'delegate to code-reviewer for review';
    const result = applyReplaceAgentNames(content, { agentNaming: 'snake_case' });
    assert.equal(result, 'delegate to code_reviewer for review');
  });

  it('returns unchanged for non-snake_case runtimes', () => {
    const content = 'delegate to code-reviewer for review';
    const result = applyReplaceAgentNames(content, { agentNaming: 'kebab-case' });
    assert.equal(result, content);
  });

  it('replaces multiple different agent names in one pass', () => {
    const content = 'ask devops-engineer and security-engineer to verify';
    const result = applyReplaceAgentNames(content, { agentNaming: 'snake_case' });
    assert.equal(result, 'ask devops_engineer and security_engineer to verify');
  });
});

describe('applyStripFeature', () => {
  it('keeps feature block content when feature flag is true', () => {
    const content = '<!-- @feature mcp -->\nsome content\n<!-- @end-feature -->\n';
    const result = applyStripFeature(content, { features: { mcp: true } });
    assert.ok(result.includes('some content'));
  });

  it('removes feature block content when feature flag is false', () => {
    const content = '<!-- @feature mcp -->\nsome content\n<!-- @end-feature -->\n';
    const result = applyStripFeature(content, { features: { mcp: false } });
    assert.equal(result.includes('some content'), false);
  });

  it('throws on unknown feature flag', () => {
    const content = '<!-- @feature unknown -->\nsome content\n<!-- @end-feature -->\n';
    assert.throws(
      () => applyStripFeature(content, { features: {} }),
      /Unknown feature flag: "unknown"/
    );
  });

  it('collapses triple newlines to double', () => {
    const content = 'before\n\n<!-- @feature mcp -->\nblock\n<!-- @end-feature -->\n\nafter\n';
    const result = applyStripFeature(content, { features: { mcp: false } });
    assert.equal(result.includes('\n\n\n'), false);
  });
});

describe('stripFrontmatter', () => {
  it('removes --- delimited frontmatter', () => {
    const content = '---\nname: foo\n---\nbody text\n';
    const result = stripFrontmatter(content);
    assert.equal(result, 'body text\n');
  });

  it('returns content unchanged when no frontmatter', () => {
    const content = 'just body text\n';
    const result = stripFrontmatter(content);
    assert.equal(result, content);
  });

  it('returns content unchanged when frontmatter not closed', () => {
    const content = '---\nname: foo\nbody text\n';
    const result = stripFrontmatter(content);
    assert.equal(result, content);
  });
});

describe('stripFeatureBlocks', () => {
  it('strips feature blocks and returns empty result for unknown flags', () => {
    const content = '<!-- @feature unknown -->\nsome content\n<!-- @end-feature -->\n';
    const result = stripFeatureBlocks(content, { features: {} });
    assert.equal(result.includes('some content'), false);
  });

  it('keeps content for known true flags', () => {
    const content = '<!-- @feature mcp -->\nkept content\n<!-- @end-feature -->\n';
    const result = stripFeatureBlocks(content, { features: { mcp: true } });
    assert.ok(result.includes('kept content'));
  });
});

describe('parseInlineArray', () => {
  it('parses "[a, b, c]" into array of trimmed strings', () => {
    const result = parseInlineArray('[a, b, c]');
    assert.deepEqual(result, ['a', 'b', 'c']);
  });

  it('returns [] for null, undefined, and empty string', () => {
    assert.deepEqual(parseInlineArray(null), []);
    assert.deepEqual(parseInlineArray(undefined), []);
    assert.deepEqual(parseInlineArray(''), []);
  });

  it('returns [] for non-bracket strings', () => {
    assert.deepEqual(parseInlineArray('a, b, c'), []);
  });

  it('filters out empty entries', () => {
    const result = parseInlineArray('[a, , b]');
    assert.deepEqual(result, ['a', 'b']);
  });
});

describe('parseFrontmatter', () => {
  it('parses key: value pairs from frontmatter', () => {
    const content = '---\nname: foo\ntier: full\n---\nbody\n';
    const result = parseFrontmatter(content);
    assert.equal(result.name, 'foo');
    assert.equal(result.tier, 'full');
  });

  it('returns {} for content without frontmatter', () => {
    const result = parseFrontmatter('just body text\n');
    assert.deepEqual(result, {});
  });

  it('returns {} for unclosed frontmatter', () => {
    const result = parseFrontmatter('---\nname: foo\nbody\n');
    assert.deepEqual(result, {});
  });
});

describe('mapTools', () => {
  it('maps canonical tool names through runtimeConfig.tools', () => {
    const frontmatter = { tools: '[read_file, write_file]' };
    const runtimeConfig = { name: 'gemini', tools: { read_file: 'ReadFile', write_file: 'WriteFile' } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['ReadFile', 'WriteFile']);
  });

  it('uses per-runtime tool override when present', () => {
    const frontmatter = {
      tools: '[read_file, write_file]',
      'tools.claude': '[Read, Write]',
    };
    const runtimeConfig = { name: 'claude', tools: { Read: 'Read', Write: 'Write' } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['Read', 'Write']);
  });

  it('flattens array tool mappings', () => {
    const frontmatter = { tools: '[bash]' };
    const runtimeConfig = { name: 'gemini', tools: { bash: ['Bash', 'Terminal'] } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['Bash', 'Terminal']);
  });

  it('keeps unmapped tool names as-is', () => {
    const frontmatter = { tools: '[custom_tool]' };
    const runtimeConfig = { name: 'gemini', tools: {} };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['custom_tool']);
  });
});
