'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  readResourceFromFilesystem,
  readAgentFromFilesystem,
} = require('../../src/mcp/content/runtime-content');
const RESOURCE_REGISTRY = require('../../src/generated/resource-registry.json');
const { AGENT_NAMES } = require('../../src/core/agent-registry');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { ANTIGRAVITY_SUBAGENT_TOOLS } = require('../support/antigravity-tools');
const { writeAgentFixture } = require('../support/agent-fixtures');
const { makeTempDir, writeTree } = require('../support/fs');
const { SRC_ROOT } = require('../support/paths');

function writeFilesystemResource(root, id, content) {
  writeTree(path.join(root, 'src'), RESOURCE_REGISTRY[id], content);
}

function writeFilesystemAgent(root, agentName, content) {
  return writeAgentFixture(path.join(root, 'src'), agentName, content);
}

function readFixtureResource(id, content, runtimeConfig) {
  const root = makeTempDir('maestro-resource-transform-');
  writeFilesystemResource(root, id, content);
  return readResourceFromFilesystem(id, runtimeConfig, path.join(root, 'src')).content;
}

describe('resource registry', () => {
  it('serves all 14 registered resources to every runtime', () => {
    assert.equal(Object.keys(RESOURCE_REGISTRY).length, 14);
    for (const runtimeName of RUNTIME_NAMES) {
      for (const id of Object.keys(RESOURCE_REGISTRY)) {
        const result = readResourceFromFilesystem(id, getRuntimeConfig(runtimeName), SRC_ROOT);
        assert.equal(result.error, undefined, `${runtimeName}: ${id}`);
        assert.equal(typeof result.content, 'string', `${runtimeName}: ${id}`);
      }
    }
  });
});

describe('served resource paths', () => {
  it('replaces ${extensionPath} with ${ENV_VAR_NAME} from runtimeConfig.env.extensionPath', () => {
    const content = 'load from ${extensionPath}/foo';
    const result = readFixtureResource('delegation', content, { env: { extensionPath: 'EXTENSION_DIR' } });
    assert.equal(result, 'load from ${EXTENSION_DIR}/foo');
  });

  it('returns content unchanged when no placeholders present', () => {
    const content = 'no placeholders here';
    const result = readFixtureResource('delegation', content, { env: { extensionPath: 'EXT' } });
    assert.equal(result, content);
  });

  it('covers every ${...Path} placeholder the served resources use', () => {
    for (const relativePath of Object.values(RESOURCE_REGISTRY)) {
      const content = fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
      const placeholders = content.match(/\$\{[A-Za-z]+Path\}/g) || [];
      assert.deepEqual(
        placeholders.filter((placeholder) => placeholder !== '${extensionPath}'),
        [],
        `${relativePath} uses a placeholder resource reads do not substitute`
      );
    }
  });
});

describe('served agent names', () => {
  const hyphenatedAgentNames = AGENT_NAMES.filter((name) => name.includes('-'));

  it('name no hyphenated agent in any resource served to qwen', () => {
    const runtimeConfig = getRuntimeConfig('qwen');
    for (const id of Object.keys(RESOURCE_REGISTRY)) {
      const { content, error } = readResourceFromFilesystem(id, runtimeConfig, SRC_ROOT);
      assert.equal(error, undefined, id);
      for (const name of hyphenatedAgentNames) {
        assert.ok(!new RegExp(`\\b${name}\\b`).test(content), `${id}: serves "${name}" to qwen`);
      }
    }
  });

  it('keep kebab-case agent names for kebab-case runtimes', () => {
    for (const name of ['antigravity', 'claude', 'codex']) {
      const { content } = readResourceFromFilesystem(
        'implementation-planning',
        getRuntimeConfig(name),
        SRC_ROOT
      );
      assert.ok(content.includes('| API contracts, endpoints | `api-designer` | `coder` |'), name);
      assert.ok(!content.includes('api_designer'), name);
    }
  });

  it('name no hyphenated agent in any agent body served to qwen', () => {
    const runtimeConfig = getRuntimeConfig('qwen');
    for (const agentName of AGENT_NAMES) {
      const { agent, error } = readAgentFromFilesystem(agentName, runtimeConfig, SRC_ROOT);
      assert.equal(error, undefined, agentName);
      for (const name of hyphenatedAgentNames) {
        assert.ok(
          !new RegExp(`\\b${name}\\b`).test(agent.body),
          `${agentName}: serves "${name}" to qwen`
        );
      }
    }
  });

  it('follow the runtime naming in an agent body and its Output Contract', () => {
    const root = makeTempDir('maestro-agent-names-');
    writeTree(root, 'src/agents/coder.md', '---\nname: coder\n---\nHand off to api-designer, then coder.\n');
    writeTree(root, 'src/agents/shared/handoff-report.md', '## Output Contract\nNotify technical-writer.\n');
    const srcRoot = path.join(root, 'src');

    const qwenResult = readAgentFromFilesystem('coder', getRuntimeConfig('qwen'), srcRoot);
    assert.equal(
      qwenResult.agent.body,
      'Hand off to api_designer, then coder.\n\n## Output Contract\nNotify technical_writer.\n'
    );
    for (const name of ['antigravity', 'claude', 'codex']) {
      const { body } = readAgentFromFilesystem('coder', getRuntimeConfig(name), srcRoot).agent;
      assert.equal(
        body,
        'Hand off to api-designer, then coder.\n\n## Output Contract\nNotify technical-writer.\n',
        name
      );
    }
  });

  it('keep kebab-case agent names in agent bodies for kebab-case runtimes', () => {
    for (const name of ['antigravity', 'claude', 'codex']) {
      const { body } = readAgentFromFilesystem('architect', getRuntimeConfig(name), SRC_ROOT).agent;
      assert.ok(body.includes('- `api-designer`: Needs component boundaries'), name);
      assert.ok(!body.includes('api_designer'), name);
    }
  });
});

describe('served skill metadata', () => {
  it('adds user-invocable: false for claude runtime and SKILL.md path', () => {
    const content = '---\nname: delegation\n---\nbody text\n';
    const result = readFixtureResource('delegation', content, getRuntimeConfig('claude'));
    assert.equal(result, '---\nname: delegation\nuser-invocable: false\n---\nbody text\n');
  });

  it('returns unchanged for non-claude runtimes', () => {
    const content = '---\nname: delegation\n---\nbody text\n';
    for (const name of ['antigravity', 'codex', 'qwen']) {
      const result = readFixtureResource('delegation', content, getRuntimeConfig(name));
      assert.equal(result, content, name);
    }
  });

  it('returns unchanged for non-SKILL.md paths', () => {
    const content = '---\nname: delegation\n---\nbody text\n';
    const result = readFixtureResource('architecture', content, getRuntimeConfig('claude'));
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

      for (const agentName of AGENT_NAMES) {
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

    for (const agentName of AGENT_NAMES) {
      const { tools } = readAgentFromFilesystem(agentName, runtimeConfig, SRC_ROOT).agent;
      assert.ok(tools.length > 0, `${agentName}: expected a tool allowlist`);
      assert.equal(new Set(tools).size, tools.length, `${agentName}: duplicate tools ${tools}`);
      for (const tool of tools) {
        assert.ok(ANTIGRAVITY_SUBAGENT_TOOLS.has(tool), `${agentName}: ${tool} is not an Antigravity subagent tool`);
      }
    }
  });
});
