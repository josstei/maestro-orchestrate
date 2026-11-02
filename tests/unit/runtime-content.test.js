'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { RuntimeContent } = require('../../src/mcp/content/runtime-content');
const RESOURCE_REGISTRY = require('../../src/generated/resource-registry.json');
const { AGENT_NAMES } = require('../../src/core/agent-registry');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { writeAgentFixture } = require('../support/agent-fixtures');
const { ANTIGRAVITY_SUBAGENT_TOOLS } = require('../support/catalog');
const { makeTempDir, writeTree } = require('../support/fs');
const { SRC_ROOT } = require('../support/paths');

const SKILL = '---\nname: delegation\n---\nbody text\n';
const CLAUDE_SKILL = '---\nname: delegation\nuser-invocable: false\n---\nbody text\n';
const contentFor = (runtimeName, src = SRC_ROOT) => new RuntimeContent(getRuntimeConfig(runtimeName), src);

/** A fake canonical src/ holding each `resources` id at its registry path. */
function fixtureSrc(resources = {}) {
  const src = path.join(makeTempDir('maestro-runtime-content-'), 'src');
  for (const [id, content] of Object.entries(resources)) writeTree(src, RESOURCE_REGISTRY[id], content);
  return src;
}

function readFixtureResource(id, content, runtimeConfig) {
  return new RuntimeContent(runtimeConfig, fixtureSrc({ [id]: content })).readResource(id).content;
}

describe('resource registry', () => {
  it('serves all 14 registered resources to every runtime', () => {
    assert.equal(Object.keys(RESOURCE_REGISTRY).length, 14);
    for (const runtimeName of RUNTIME_NAMES) {
      for (const id of Object.keys(RESOURCE_REGISTRY)) {
        const result = contentFor(runtimeName).readResource(id);
        assert.equal(result.error, undefined, `${runtimeName}: ${id}`);
        assert.equal(typeof result.content, 'string', `${runtimeName}: ${id}`);
      }
    }
  });
});

describe('served resource paths', () => {
  it('replaces ${extensionPath} with ${ENV_VAR_NAME} from env.extensionPath and leaves other text unchanged', () => {
    const runtimeConfig = { env: { extensionPath: 'EXTENSION_DIR' } };
    const result = readFixtureResource('delegation', 'load from ${extensionPath}/foo', runtimeConfig);
    assert.equal(result, 'load from ${EXTENSION_DIR}/foo');
    assert.equal(readFixtureResource('delegation', 'no placeholders here', runtimeConfig), 'no placeholders here');
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
    const qwen = contentFor('qwen');
    for (const id of Object.keys(RESOURCE_REGISTRY)) {
      const { content, error } = qwen.readResource(id);
      assert.equal(error, undefined, id);
      for (const name of hyphenatedAgentNames) {
        assert.ok(!new RegExp(`\\b${name}\\b`).test(content), `${id}: serves "${name}" to qwen`);
      }
    }
  });

  it('follow the runtime naming in an agent body and its Output Contract', () => {
    const src = fixtureSrc();
    const body = 'Hand off to api-designer, then coder and api-designer, not api-designers or xapi-designer.\n';
    writeTree(src, 'agents/coder.md', `---\nname: coder\n---\n${body}`);
    writeTree(src, 'agents/shared/handoff-report.md', '## Output Contract\nNotify technical-writer.\n');

    for (const name of RUNTIME_NAMES) {
      const expected = name === 'qwen'
        ? 'Hand off to api_designer, then coder and api_designer, not api-designers or xapi-designer.\n\n' +
          '## Output Contract\nNotify technical_writer.\n'
        : `${body}\n## Output Contract\nNotify technical-writer.\n`;
      assert.equal(contentFor(name, src).readAgent('coder').agent.body, expected, name);
    }
  });
});

describe('served skill metadata', () => {
  it('adds user-invocable: false only for claude and only on a SKILL.md path', () => {
    assert.equal(readFixtureResource('delegation', SKILL, getRuntimeConfig('claude')), CLAUDE_SKILL);
    for (const name of ['antigravity', 'codex', 'qwen']) {
      assert.equal(readFixtureResource('delegation', SKILL, getRuntimeConfig(name)), SKILL, name);
    }
    assert.equal(readFixtureResource('architecture', SKILL, getRuntimeConfig('claude')), SKILL);
  });
});

describe('runtime-content filesystem reads', () => {
  it('reads filesystem-backed canonical content for claude', () => {
    const src = fixtureSrc({
      delegation: '---\nname: delegation\ndescription: Filesystem copy\n---\nFilesystem content.\n',
    });
    const result = contentFor('claude', src).readResource('delegation');

    assert.ok(result.content.includes('Filesystem content.'));
    assert.ok(result.content.includes('user-invocable: false'));
  });

  it('reads filesystem-backed canonical agent and resource content for codex', () => {
    const src = fixtureSrc({ delegation: 'Filesystem content.\n' });
    const outputContract = writeAgentFixture(
      src,
      'coder',
      '---\nname: coder\ntools: [read_file]\n---\nFilesystem agent body.\n'
    );
    const codex = contentFor('codex', src);
    const resourceResult = codex.readResource('delegation');
    const agentResult = codex.readAgent('coder');

    assert.equal(resourceResult.content, 'Filesystem content.\n');
    assert.equal(agentResult.agent.body, `Filesystem agent body.\n\n${outputContract}`);
    assert.deepEqual(agentResult.agent.tools, ['direct file reads']);
  });

  it('collapses blank lines across the frontmatter boundary of an agent file', () => {
    const src = fixtureSrc();
    const outputContract = writeAgentFixture(src, 'coder', '---\nname: coder\n---\n\n\nbody\n');

    const agentResult = contentFor('codex', src).readAgent('coder');

    assert.equal(agentResult.agent.body, `\nbody\n\n${outputContract}`);
  });

  it('serves CRLF agent and resource sources with LF line endings', () => {
    const crlf = (text) => text.replace(/\n/g, '\r\n');
    const src = fixtureSrc({ delegation: crlf(SKILL) });
    const outputContract = writeAgentFixture(
      src,
      'coder',
      crlf('---\nname: coder\ntools: [read_file]\n---\nAgent body.\n<example>\nx\n</example>\n')
    );
    writeTree(src, 'agents/shared/handoff-report.md', crlf(outputContract));

    const resourceResult = contentFor('claude', src).readResource('delegation');
    const agentResult = contentFor('codex', src).readAgent('coder');

    assert.equal(resourceResult.content, CLAUDE_SKILL);
    assert.equal(agentResult.agent.body, `Agent body.\n\n${outputContract}`);
    assert.deepEqual(agentResult.agent.tools, ['direct file reads']);
  });

  it('returns filesystem read errors when codex content or the Output Contract fragment is missing', () => {
    const src = fixtureSrc();
    const codex = contentFor('codex', src);

    assert.equal(codex.readResource('delegation').error, 'Failed to read resource "delegation": ENOENT');
    assert.equal(codex.readAgent('coder').error, 'Failed to read agent "coder": ENOENT');
    writeTree(src, 'agents/coder.md', '---\nname: coder\n---\nbody\n');
    assert.equal(codex.readAgent('coder').error, 'Failed to read agent "coder": ENOENT');
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
      const content = contentFor(runtimeName);

      for (const agentName of AGENT_NAMES) {
        const result = content.readAgent(agentName);
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
    const antigravity = contentFor('antigravity');

    for (const agentName of AGENT_NAMES) {
      const { tools } = antigravity.readAgent(agentName).agent;
      assert.ok(tools.length > 0, `${agentName}: expected a tool allowlist`);
      assert.equal(new Set(tools).size, tools.length, `${agentName}: duplicate tools ${tools}`);
      for (const tool of tools) {
        assert.ok(ANTIGRAVITY_SUBAGENT_TOOLS.has(tool), `${agentName}: ${tool} is not an Antigravity subagent tool`);
      }
    }
  });
});
