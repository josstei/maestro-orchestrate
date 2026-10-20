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
  readResourceFromFilesystem,
  readAgentFromFilesystem,
} = require('../../src/mcp/content/runtime-content');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { ANTIGRAVITY_SUBAGENT_TOOLS } = require('../support/antigravity-tools');
const { writeAgentFixture } = require('../support/agent-fixtures');
const { AGENT_COUNT } = require('../support/catalog');
const { makeTempDir, writeTree } = require('../support/fs');
const { SRC_ROOT } = require('../support/paths');

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
  it(`is frozen with ${AGENT_COUNT} entries, all kebab-case strings`, () => {
    assert.equal(Object.isFrozen(AGENT_ALLOWLIST), true);
    assert.equal(AGENT_ALLOWLIST.length, AGENT_COUNT);

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
    for (const name of ['antigravity', 'codex', 'qwen']) {
      const result = applySkillMetadata(content, { name }, 'skills/shared/delegation/SKILL.md');
      assert.equal(result, content, name);
    }
  });

  it('returns unchanged for non-SKILL.md paths', () => {
    const content = '---\nname: delegation\n---\nbody text\n';
    const result = applySkillMetadata(content, { name: 'claude' }, 'references/architecture.md');
    assert.equal(result, content);
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
    writeTree(root, 'src/agents/coder.md', '---\nname: coder\n---\nbody\n');

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

describe('served Antigravity agent tools', () => {
  it('name only tools Antigravity grants a subagent, each once', () => {
    const runtimeConfig = getRuntimeConfig('antigravity');

    for (const agentName of AGENT_ALLOWLIST) {
      const { tools } = readAgentFromFilesystem(agentName, runtimeConfig, SRC_ROOT).agent;
      assert.ok(tools.length > 0, `${agentName}: expected a tool allowlist`);
      assert.equal(new Set(tools).size, tools.length, `${agentName}: duplicate tools ${tools}`);
      for (const tool of tools) {
        assert.ok(ANTIGRAVITY_SUBAGENT_TOOLS.has(tool), `${agentName}: ${tool} is not an Antigravity subagent tool`);
      }
    }
  });
});
