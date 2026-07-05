import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHandler as createSkillContentHandler } from '../../src/mcp/handlers/get-skill-content.js';
import { createHandler as createAgentHandler } from '../../src/mcp/handlers/get-agent.js';
import { getRuntimeConfig } from '../../src/mcp/runtime/runtime-config-map.js';

import {
  makeTempSrcRoot,
  cleanupTempRoots,
  writeAgent,
  writeResource,
  withExtensionRoot,
} from '../support/content.js';

import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const REPO_ROOT = path.resolve(moduleDirname, '..', '..');

const REMOVED_SESSION_READER_PATH = [
  'src',
  'scripts',
  ['read', 'active', 'session'].join('-') + '.js',
].join('/');

after(cleanupTempRoots);

describe('get_skill_content handler', () => {
  it('reads canonical src content and applies skill transforms', () => {
    const root = makeTempSrcRoot('maestro-skill-content-');
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
    const root = makeTempSrcRoot('maestro-architecture-');
    const refDir = path.join(root, 'src', 'references');
    fs.mkdirSync(refDir, { recursive: true });
    fs.writeFileSync(
      path.join(refDir, 'architecture.md'),
      [
        '<!-- @feature mcpStateContract -->',
        'Gemini uses ${extensionPath} and code-reviewer.',
        '<!-- @end-feature -->',
        '<!-- @feature exampleBlocks -->',
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

  it('serves Claude architecture content with the MCP state contract', () => {
    const handler = createSkillContentHandler(
      getRuntimeConfig('claude'),
      path.join(REPO_ROOT, 'src')
    );

    const result = withExtensionRoot(REPO_ROOT, () =>
      handler({ resources: ['architecture'] })
    );
    const content = result.contents.architecture;

    assert.deepEqual(result.errors, {});
    assert.ok(content.includes('State is mediated exclusively through MCP state tools'));
    assert.ok(!content.includes(REMOVED_SESSION_READER_PATH));
    assert.ok(!content.includes('${CLAUDE_PLUGIN_ROOT}/../' + ['src', 'scripts'].join('/')));
  });

  it('applies agent-name replacement to delegation skill for snake_case runtimes', () => {
    const root = makeTempSrcRoot('maestro-delegation-names-');
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

  it('reads package-root content through the Claude handler and applies skill transforms', () => {
    const root = makeTempSrcRoot('maestro-skill-claude-source-');
    const claudeRoot = path.join(root, 'claude');
    const sourceSrc = path.join(root, 'src');

    writeResource(
      sourceSrc,
      'delegation',
      '---\nname: delegation\ndescription: Claude source skill\n---\nUse ${extensionPath} from package-root source.\n'
    );

    const handler = createSkillContentHandler(
      getRuntimeConfig('claude'),
      sourceSrc
    );

    const result = withExtensionRoot(claudeRoot, () =>
      handler({ resources: ['delegation'] })
    );
    const content = result.contents.delegation;

    assert.deepEqual(result.errors, {});
    assert.ok(content.includes('${CLAUDE_PLUGIN_ROOT}'));
    assert.ok(content.includes('user-invocable: false'));
    assert.ok(content.includes('from package-root source'));
  });

  it('expands the shared roster marker in the delegation skill for gemini (snake_case)', () => {
    const handler = createSkillContentHandler(
      getRuntimeConfig('gemini'),
      path.join(REPO_ROOT, 'src')
    );

    const result = withExtensionRoot(REPO_ROOT, () =>
      handler({ resources: ['delegation'] })
    );
    const content = result.contents.delegation;

    assert.deepEqual(result.errors, {});
    assert.ok(content.includes('| `zos_sysprog` |'));
    assert.ok(!content.includes('<!-- @roster -->'));
  });

  it('expands the shared roster marker in the delegation skill for claude (kebab-case)', () => {
    const handler = createSkillContentHandler(
      getRuntimeConfig('claude'),
      path.join(REPO_ROOT, 'src')
    );

    const result = withExtensionRoot(REPO_ROOT, () =>
      handler({ resources: ['delegation'] })
    );
    const content = result.contents.delegation;

    assert.deepEqual(result.errors, {});
    assert.ok(content.includes('| `zos-sysprog` |'));
    assert.ok(!content.includes('<!-- @roster -->'));
  });

  it('expands the shared roster marker in the architecture reference for gemini (snake_case)', () => {
    const handler = createSkillContentHandler(
      getRuntimeConfig('gemini'),
      path.join(REPO_ROOT, 'src')
    );

    const result = withExtensionRoot(REPO_ROOT, () =>
      handler({ resources: ['architecture'] })
    );
    const content = result.contents.architecture;

    assert.deepEqual(result.errors, {});
    assert.ok(content.includes('| `zos_sysprog` |'));
    assert.ok(!content.includes('<!-- @roster -->'));
  });

  it('expands the shared roster marker in the architecture reference for claude (kebab-case)', () => {
    const handler = createSkillContentHandler(
      getRuntimeConfig('claude'),
      path.join(REPO_ROOT, 'src')
    );

    const result = withExtensionRoot(REPO_ROOT, () =>
      handler({ resources: ['architecture'] })
    );
    const content = result.contents.architecture;

    assert.deepEqual(result.errors, {});
    assert.ok(content.includes('| `zos-sysprog` |'));
    assert.ok(!content.includes('<!-- @roster -->'));
  });

  it('rejects unknown resources before filesystem lookup', () => {
    const root = makeTempSrcRoot('maestro-skill-unknown-');
    const claudeRoot = path.join(root, 'claude');
    const handler = createSkillContentHandler(
      getRuntimeConfig('claude'),
      path.join(root, 'src')
    );

    const result = withExtensionRoot(claudeRoot, () =>
      handler({ resources: ['not-a-resource'] })
    );

    assert.deepEqual(result.contents, {});
    assert.match(result.errors['not-a-resource'], /^Unknown resource identifier: "not-a-resource"/);
    assert.doesNotMatch(result.errors['not-a-resource'], /Failed to read/);
  });
});

describe('get_agent handler', () => {
  it('returns stripped methodology bodies and runtime-mapped tools', () => {
    const root = makeTempSrcRoot('maestro-agent-content-');
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
    const root = makeTempSrcRoot('maestro-agent-snake-');
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
    const root = makeTempSrcRoot('maestro-agent-toolname-');
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
    const root = makeTempSrcRoot('maestro-agent-snaketool-');
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

  it('reads package-root content through the Claude handler and applies agent transforms', () => {
    const root = makeTempSrcRoot('maestro-agent-claude-source-');
    const claudeRoot = path.join(root, 'claude');
    const sourceSrc = path.join(root, 'src');

    writeAgent(
      sourceSrc,
      'code-reviewer',
      [
        '---',
        'name: code-reviewer',
        'tools: [read_file, write_file]',
        'tools.claude: [Read, Write]',
        '---',
        '',
        'Package-root reviewer methodology.',
      ].join('\n')
    );

    const handler = createAgentHandler(
      getRuntimeConfig('claude'),
      sourceSrc
    );

    const result = withExtensionRoot(claudeRoot, () =>
      handler({ agents: ['code-reviewer'] })
    );

    assert.deepEqual(result.errors, {});
    assert.ok(result.agents['code-reviewer']);
    assert.ok(result.agents['code-reviewer'].body.includes('Package-root reviewer methodology.'));
    assert.equal(result.agents['code-reviewer'].tool_name, 'code-reviewer');
    assert.deepEqual(result.agents['code-reviewer'].tools, ['Read', 'Write']);
  });

  it('rejects unknown agents before filesystem lookup', () => {
    const root = makeTempSrcRoot('maestro-agent-unknown-');
    const claudeRoot = path.join(root, 'claude');
    const handler = createAgentHandler(
      getRuntimeConfig('claude'),
      path.join(root, 'src')
    );

    const result = withExtensionRoot(claudeRoot, () =>
      handler({ agents: ['not-a-real-agent'] })
    );

    assert.deepEqual(result.agents, {});
    assert.match(result.errors['not-a-real-agent'], /^Unknown agent identifier: "not-a-real-agent"/);
    assert.doesNotMatch(result.errors['not-a-real-agent'], /Failed to read/);
  });

  it('replays Gemini ux_designer delegation scenario end-to-end', () => {
    const root = makeTempSrcRoot('maestro-replay-');
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
