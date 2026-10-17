'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  RESOURCE_ALLOWLIST,
  AGENT_ALLOWLIST,
  applyReplacePaths,
  applySkillMetadata,
  mapTools,
  readResourceFromFilesystem,
  readAgentFromFilesystem,
} = require('../../src/mcp/content/runtime-content');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/mcp/runtime/runtime-config-map');
const { writeAgentFixture } = require('../support/agent-fixtures');
const { makeTempDir, writeTree } = require('../support/fs');

const SRC_ROOT = path.resolve(__dirname, '../../src');

function writeFilesystemResource(root, id, content) {
  writeTree(path.join(root, 'src'), RESOURCE_ALLOWLIST[id], content);
}

function writeFilesystemAgent(root, agentName, content) {
  return writeAgentFixture(path.join(root, 'src'), agentName, content);
}

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

describe('mapTools', () => {
  it('maps canonical tool names through runtimeConfig.tools', () => {
    const frontmatter = { tools: ['read_file', 'write_file'] };
    const runtimeConfig = { name: 'gemini', tools: { read_file: 'ReadFile', write_file: 'WriteFile' } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['ReadFile', 'WriteFile']);
  });

  it('uses per-runtime tool override when present', () => {
    const frontmatter = {
      tools: ['read_file', 'write_file'],
      'tools.claude': ['Read', 'Write'],
    };
    const runtimeConfig = { name: 'claude', tools: { Read: 'Read', Write: 'Write' } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['Read', 'Write']);
  });

  it('maps the per-runtime override through runtimeConfig.tools as well', () => {
    const frontmatter = {
      tools: ['read_file'],
      'tools.gemini': ['write_todos'],
    };
    const runtimeConfig = { name: 'gemini', tools: { write_todos: 'not available' } };
    assert.deepEqual(mapTools(frontmatter, runtimeConfig), ['not available']);
  });

  it('flattens array tool mappings', () => {
    const frontmatter = { tools: ['bash'] };
    const runtimeConfig = { name: 'gemini', tools: { bash: ['Bash', 'Terminal'] } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['Bash', 'Terminal']);
  });

  it('keeps unmapped tool names as-is', () => {
    const frontmatter = { tools: ['custom_tool'] };
    const runtimeConfig = { name: 'gemini', tools: {} };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['custom_tool']);
  });

  it('drops empty entries and ignores non-array tool values', () => {
    const runtimeConfig = { name: 'gemini', tools: {} };
    assert.deepEqual(mapTools({ tools: ['a', '', 'b'] }, runtimeConfig), ['a', 'b']);
    assert.deepEqual(mapTools({ tools: 'a, b' }, runtimeConfig), []);
    assert.deepEqual(mapTools({}, runtimeConfig), []);
  });
});

describe('runtime-content filesystem reads', () => {
  it('reads filesystem-backed canonical content for claude', () => {
    const root = makeTempDir('maestro-provider-claude-');

    writeFilesystemResource(
      root,
      'delegation',
      '---\nname: delegation\ndescription: Filesystem copy\n---\nFilesystem content.\n'
    );
    const result = readResourceFromFilesystem(
      'delegation',
      getRuntimeConfig('claude'),
      path.join(root, 'src')
    );

    assert.ok(result.content.includes('Filesystem content.'));
    assert.ok(result.content.includes('user-invocable: false'));
  });

  it('reads filesystem-backed canonical agent and resource content for codex', () => {
    const root = makeTempDir('maestro-provider-codex-');

    writeFilesystemResource(root, 'delegation', 'Filesystem content.\n');
    const outputContract = writeFilesystemAgent(
      root,
      'coder',
      '---\nname: coder\ntools: [read_file]\n---\nFilesystem agent body.\n'
    );
    const runtimeConfig = getRuntimeConfig('codex');
    const srcRoot = path.join(root, 'src');
    const resourceResult = readResourceFromFilesystem('delegation', runtimeConfig, srcRoot);
    const agentResult = readAgentFromFilesystem('coder', runtimeConfig, srcRoot);

    assert.equal(resourceResult.content, 'Filesystem content.\n');
    assert.equal(agentResult.agent.body, `Filesystem agent body.\n\n${outputContract}`);
    assert.deepEqual(agentResult.agent.tools, ['direct file reads']);
  });

  it('collapses blank lines across the frontmatter boundary of an agent file', () => {
    const root = makeTempDir('maestro-provider-blank-');
    const outputContract = writeFilesystemAgent(root, 'coder', '---\nname: coder\n---\n\n\nbody\n');

    const agentResult = readAgentFromFilesystem(
      'coder',
      getRuntimeConfig('codex'),
      path.join(root, 'src')
    );

    assert.equal(agentResult.agent.body, `\nbody\n\n${outputContract}`);
  });

  it('returns filesystem read errors when codex content is missing', () => {
    const root = makeTempDir('maestro-provider-empty-');
    const runtimeConfig = getRuntimeConfig('codex');
    const srcRoot = path.join(root, 'src');
    const resourceResult = readResourceFromFilesystem('delegation', runtimeConfig, srcRoot);
    const agentResult = readAgentFromFilesystem('coder', runtimeConfig, srcRoot);

    assert.equal(resourceResult.error, 'Failed to read resource "delegation": ENOENT');
    assert.equal(agentResult.error, 'Failed to read agent "coder": ENOENT');
  });

  it('reports a missing Output Contract fragment as an agent read error', () => {
    const root = makeTempDir('maestro-provider-nocontract-');
    const agentPath = path.join(root, 'src', 'agents', 'coder.md');
    fs.mkdirSync(path.dirname(agentPath), { recursive: true });
    fs.writeFileSync(agentPath, '---\nname: coder\n---\nbody\n', 'utf8');

    const agentResult = readAgentFromFilesystem(
      'coder',
      getRuntimeConfig('codex'),
      path.join(root, 'src')
    );

    assert.equal(agentResult.error, 'Failed to read agent "coder": ENOENT');
  });
});

describe('served agent bodies', () => {
  const outputContract = fs.readFileSync(
    path.join(SRC_ROOT, 'agents', 'shared', 'handoff-report.md'),
    'utf8'
  );

  it('keep the shared Output Contract as a single newline-terminated section', () => {
    assert.ok(outputContract.startsWith('## Output Contract\n'));
    assert.ok(outputContract.endsWith('\n') && !outputContract.endsWith('\n\n'));
  });

  for (const runtimeName of RUNTIME_NAMES) {
    it(`end with the shared Output Contract for every agent on ${runtimeName}`, () => {
      const runtimeConfig = getRuntimeConfig(runtimeName);

      for (const agentName of AGENT_ALLOWLIST) {
        const result = readAgentFromFilesystem(agentName, runtimeConfig, SRC_ROOT);
        assert.equal(result.error, undefined, `${agentName}: ${result.error}`);

        const { body } = result.agent;
        assert.equal(
          body.split('\n\n## Output Contract\n').length,
          2,
          `${agentName}: expected exactly one Output Contract section`
        );
        assert.ok(
          !body.includes('\n\n\n## Output Contract\n'),
          `${agentName}: the agent file must end with exactly one newline`
        );
        assert.ok(body.endsWith(outputContract), `${agentName}: body must end with the fragment`);
      }
    });
  }
});
