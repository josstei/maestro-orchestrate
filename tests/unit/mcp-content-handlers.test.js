'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { handleGetAgent, handleGetSkillContent } = require('../../src/mcp/handlers/content');
const { AGENT_NAMES } = require('../../src/core/agent-registry');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { ANTIGRAVITY_SUBAGENT_TOOLS } = require('../support/antigravity-tools');
const { SRC_ROOT } = require('../support/paths');

// The served resource ids, in the order the unknown-identifier error lists them.
const RESOURCE_IDS = [
  'agent-base-protocol',
  'code-review',
  'delegation',
  'design-dialogue',
  'execution',
  'filesystem-safety-protocol',
  'implementation-planning',
  'session-management',
  'validation',
  'design-document',
  'implementation-plan',
  'session-state',
  'architecture',
  'orchestration-steps',
];

const readSrc = (relativePath) => fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');

function serveSkills(runtime, resources) {
  return handleGetSkillContent({ resources }, null, { runtimeConfig: getRuntimeConfig(runtime) });
}

function serveAgents(runtime, agents) {
  return handleGetAgent({ agents }, null, { runtimeConfig: getRuntimeConfig(runtime) });
}

/** The body of the one `<!-- @feature <flag> -->` block in `content`. */
function featureBlockBody(content, flag) {
  const match = content.match(
    new RegExp(`<!-- @feature ${flag} -->\\n([\\s\\S]*?)<!-- @end-feature -->`)
  );
  assert.ok(match, `no ${flag} block`);
  return match[1];
}

describe('get_skill_content handler', () => {
  it('rejects a missing or empty resources list', () => {
    for (const resources of [undefined, [], 'delegation']) {
      assert.throws(() => serveSkills('codex', resources), {
        name: 'ValidationError',
        message: 'resources must be a non-empty array of resource identifiers',
      });
    }
  });

  it('reports each unknown id with the known identifiers and serves the rest', () => {
    const result = serveSkills('codex', ['nope', 'delegation', 7]);

    assert.deepEqual(Object.keys(result.contents), ['delegation']);
    assert.deepEqual(result.errors, {
      nope: `Unknown resource identifier: "nope". Known identifiers: ${RESOURCE_IDS.join(', ')}`,
      7: `Unknown resource identifier: "7". Known identifiers: ${RESOURCE_IDS.join(', ')}`,
    });
  });

  it('serves every resource on every runtime', () => {
    for (const runtime of RUNTIME_NAMES) {
      const result = serveSkills(runtime, RESOURCE_IDS);
      assert.deepEqual(result.errors, {}, runtime);
      assert.deepEqual(Object.keys(result.contents), RESOURCE_IDS, runtime);
    }
  });

  it('serves a resource untransformed where no runtime transform applies', () => {
    assert.equal(
      serveSkills('codex', ['delegation']).contents.delegation,
      readSrc('skills/shared/delegation/SKILL.md')
    );
  });

  it("rewrites ${extensionPath} to the runtime's extension-root variable and leaves no other path placeholder", () => {
    for (const runtime of RUNTIME_NAMES) {
      const placeholder = '${' + getRuntimeConfig(runtime).env.extensionPath + '}';
      const { contents } = serveSkills(runtime, RESOURCE_IDS);
      for (const [id, content] of Object.entries(contents)) {
        const placeholders = content.match(/\$\{[A-Za-z_.]*\}/g) || [];
        assert.deepEqual(
          placeholders.filter((found) => found !== placeholder && found !== '${CLAUDE_PLUGIN_ROOT}'),
          [],
          `${runtime} ${id}`
        );
      }
    }
    assert.ok(
      serveSkills('antigravity', ['architecture']).contents.architecture.includes('`node ${PLUGIN_ROOT}/src/scripts/')
    );
    assert.ok(
      serveSkills('qwen', ['architecture']).contents.architecture.includes('`node ${extensionPath}/src/scripts/')
    );
  });

  it('marks SKILL.md resources user-invocable: false on claude only', () => {
    const claude = serveSkills('claude', ['delegation', 'architecture']).contents;
    assert.ok(claude.delegation.startsWith('---\nname: delegation\n'));
    assert.match(claude.delegation, /^description: .*\nuser-invocable: false\n---\n/m);
    assert.ok(!claude.architecture.includes('user-invocable'));

    for (const runtime of ['antigravity', 'codex', 'qwen']) {
      assert.ok(!serveSkills(runtime, ['delegation']).contents.delegation.includes('user-invocable'), runtime);
    }
  });

  it('serves each runtime only the state contract its features enable, without feature markers', () => {
    const architecture = readSrc('references/architecture.md');
    const sampleLines = {
      scriptBasedStateContract: '/src/scripts/ensure-workspace.js <state_dir>`',
      claudeStateContract: '`node ${CLAUDE_PLUGIN_ROOT}/../src/scripts/ensure-workspace.js docs/maestro`',
      codexStateContract: '`node ./src/scripts/ensure-workspace.js docs/maestro`',
    };

    for (const runtime of RUNTIME_NAMES) {
      const { features } = getRuntimeConfig(runtime);
      const served = serveSkills(runtime, ['architecture']).contents.architecture;
      assert.ok(!served.includes('@feature') && !served.includes('@end-feature'), runtime);
      for (const [flag, line] of Object.entries(sampleLines)) {
        assert.ok(featureBlockBody(architecture, flag).includes(line), `${flag}: stale sample line`);
        assert.equal(served.includes(line), features[flag], `${runtime} ${flag}`);
      }
    }

    // An enabled block's body is kept verbatim, nested Markdown included.
    assert.ok(
      serveSkills('claude', ['architecture']).contents.architecture
        .includes(featureBlockBody(architecture, 'claudeStateContract'))
    );
  });

  it("rewrites agent names to the runtime's naming in the resources that name agents", () => {
    const qwen = serveSkills('qwen', ['architecture', 'delegation', 'implementation-planning']).contents;
    for (const id of ['architecture', 'delegation']) {
      assert.ok(qwen[id].includes('`code_reviewer`') && qwen[id].includes('`ux_designer`'), id);
      assert.ok(!qwen[id].includes('code-reviewer') && !qwen[id].includes('ux-designer'), id);
    }
    // implementation-planning names agents but is not rewritten.
    assert.ok(qwen['implementation-planning'].includes('code-reviewer'));

    assert.ok(serveSkills('claude', ['delegation']).contents.delegation.includes('`code-reviewer`'));
  });

  it('serves every runtime a delegation skill that explains its result surface', () => {
    for (const runtime of RUNTIME_NAMES) {
      const { result_surface: surface } = getRuntimeConfig(runtime).delegation.constraints;
      assert.ok(
        serveSkills(runtime, ['delegation']).contents.delegation.includes(`\`result_surface: "${surface}"\``),
        `${runtime}: delegation skill does not explain its result surface`
      );
    }
    // Antigravity has no post-delegation hook, so the orchestrator validates handoffs.
    assert.ok(
      serveSkills('antigravity', ['delegation']).contents.delegation
        .includes('Antigravity runs no post-delegation hook')
    );
  });

  it('serves antigravity the script-based state contract rooted at ${PLUGIN_ROOT}', () => {
    const content = serveSkills('antigravity', ['architecture']).contents.architecture;

    assert.ok(content.includes('Maestro maintains session state under `<state_dir>`'));
    assert.ok(content.includes('`node ${PLUGIN_ROOT}/src/scripts/ensure-workspace.js <state_dir>`'));
    assert.ok(!content.includes('${extensionPath}'));
    assert.ok(!content.includes('${CLAUDE_PLUGIN_ROOT}'));
    assert.ok(!content.includes('node ./src/scripts/'));
  });
});

describe('get_agent handler', () => {
  const outputContract = readSrc('agents/shared/handoff-report.md');

  it('rejects a missing or empty agents list', () => {
    for (const agents of [undefined, [], 'coder']) {
      assert.throws(() => serveAgents('codex', agents), {
        name: 'ValidationError',
        message: 'agents must be a non-empty array of agent identifiers',
      });
    }
  });

  it('reports unknown and empty names with the known identifiers', () => {
    const known = AGENT_NAMES.join(', ');
    const result = serveAgents('codex', ['nope', '', '  ', null, 'coder']);

    assert.deepEqual(Object.keys(result.agents), ['coder']);
    assert.deepEqual(result.errors, {
      nope: `Unknown agent identifier: "nope". Known identifiers: ${known}`,
      '(empty)': `Unknown agent identifier: "". Known identifiers: ${known}`,
    });
  });

  it('keys each agent by the trimmed requested name and names it for the runtime', () => {
    const qwen = serveAgents('qwen', [' ux_designer ', 'code-reviewer']);
    assert.deepEqual(qwen.errors, {});
    assert.deepEqual(Object.keys(qwen.agents), ['ux_designer', 'code-reviewer']);
    assert.equal(qwen.agents.ux_designer.tool_name, 'ux_designer');
    assert.equal(qwen.agents['code-reviewer'].tool_name, 'code_reviewer');
    assert.ok(qwen.agents.ux_designer.body.includes('You are a **UX Designer**'));
    assert.deepEqual(qwen.agents.ux_designer.tools, [
      'read_file',
      'list_directory',
      'glob',
      'grep_search',
      'write_file',
      'edit',
      'web_search',
      'read_many_files',
      'ask_user_question',
    ]);

    const claude = serveAgents('claude', ['code_reviewer']);
    assert.equal(claude.agents.code_reviewer.tool_name, 'code-reviewer');
    assert.deepEqual(Object.keys(claude.agents.code_reviewer), ['body', 'tools', 'tool_name']);
  });

  it('serves the methodology body without frontmatter, keeping example blocks only where enabled', () => {
    const exampleBlock = featureBlockBody(readSrc('agents/coder.md'), 'exampleBlocks');

    for (const runtime of RUNTIME_NAMES) {
      const { body } = serveAgents(runtime, ['coder']).agents.coder;
      assert.ok(body.includes('You are a **Senior Software Engineer**'), runtime);
      assert.ok(!body.includes('tools:') && !body.includes('@feature'), runtime);
      assert.equal(body.includes(exampleBlock), getRuntimeConfig(runtime).features.exampleBlocks, runtime);
    }
    assert.ok(serveAgents('claude', ['coder']).agents.coder.body.startsWith('<example>\n'));
    assert.ok(serveAgents('codex', ['coder']).agents.coder.body.startsWith('\nYou are a **Senior Software Engineer**'));
  });

  it('maps tools through the runtime, preferring a tools.<runtime> list', () => {
    assert.deepEqual(serveAgents('claude', ['coder']).agents.coder.tools, [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'TaskCreate', 'TaskUpdate', 'TaskList', 'Skill',
    ]);
    // read_file, read_many_files and activate_skill all map to view_file, and
    // write_todos has no Antigravity equivalent.
    assert.deepEqual(serveAgents('antigravity', ['coder']).agents.coder.tools, [
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

  it('ends every agent on every runtime with the shared Output Contract', () => {
    assert.ok(outputContract.startsWith('## Output Contract\n'));
    assert.ok(outputContract.endsWith('\n') && !outputContract.endsWith('\n\n'));

    for (const runtime of RUNTIME_NAMES) {
      const result = serveAgents(runtime, AGENT_NAMES);
      assert.deepEqual(result.errors, {}, runtime);

      for (const name of AGENT_NAMES) {
        const { body } = result.agents[name];
        assert.equal(
          body.split('\n\n## Output Contract\n').length,
          2,
          `${runtime} ${name}: expected exactly one Output Contract section`
        );
        assert.ok(
          !body.includes('\n\n\n## Output Contract\n'),
          `${name}: the agent file must end with exactly one newline`
        );
        assert.ok(body.endsWith(outputContract), `${runtime} ${name}: body must end with the fragment`);
      }
    }
  });

  it('names only tools Antigravity grants a subagent, each once', () => {
    const { agents } = serveAgents('antigravity', AGENT_NAMES);

    for (const name of AGENT_NAMES) {
      const { tools } = agents[name];
      assert.ok(tools.length > 0, `${name}: expected a tool allowlist`);
      assert.equal(new Set(tools).size, tools.length, `${name}: duplicate tools ${tools}`);
      for (const tool of tools) {
        assert.ok(ANTIGRAVITY_SUBAGENT_TOOLS.has(tool), `${name}: ${tool} is not an Antigravity subagent tool`);
      }
    }
  });
});
