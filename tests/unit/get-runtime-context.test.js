'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../../src/mcp/handlers/get-runtime-context');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/mcp/runtime/runtime-config-map');
const { AGENT_NAMES, KNOWN_AGENTS } = require('../../src/core/agent-registry');

// The get_runtime_context response is a contract the runtime prompts rely on,
// so the expected values are written out here instead of read from the configs.
const SYNCHRONOUS_CONSTRAINTS = { result_surface: 'synchronous', child_cannot_prompt_user: false };

const EXPECTED_CONTEXT = {
  claude: {
    mcp_prefix: 'mcp__plugin_maestro_maestro__',
    plan_mode_native: true,
    agent_dispatch: {
      pattern: 'Agent(subagent_type: "maestro:{{agent}}", prompt: "...")',
      naming: 'kebab-case',
      prefix: 'maestro:',
    },
    constraints: SYNCHRONOUS_CONSTRAINTS,
    agents: AGENT_NAMES,
    tools: { read_file: 'Read', write_file: 'Write' },
  },
  codex: {
    mcp_prefix: 'mcp__maestro_maestro__',
    plan_mode_native: false,
    agent_dispatch: { pattern: 'spawn_agent(...)', naming: 'kebab-case', prefix: '' },
    constraints: {
      fork_full_context_incompatible_with: ['agent_type', 'model', 'reasoning_effort'],
      result_surface: 'deferred',
      child_cannot_prompt_user: true,
    },
    agents: AGENT_NAMES,
    tools: { read_file: 'direct file reads', run_shell_command: 'exec_command' },
  },
  qwen: {
    mcp_prefix: '',
    plan_mode_native: false,
    agent_dispatch: { pattern: '{{agent}}(query: "...")', naming: 'snake_case', prefix: '' },
    constraints: SYNCHRONOUS_CONSTRAINTS,
    agents: KNOWN_AGENTS,
    tools: {
      read_file: 'read_file',
      replace: 'edit',
      run_shell_command: 'run_shell_command',
      ask_user: 'ask_user_question',
      activate_skill: 'skill',
      write_todos: 'todo_write',
      google_web_search: 'web_search',
    },
  },
};

describe('get_runtime_context handler', () => {
  for (const [runtime, expected] of Object.entries(EXPECTED_CONTEXT)) {
    it(`reports the shipped ${runtime} runtime context`, () => {
      const result = createHandler(getRuntimeConfig(runtime))({});

      assert.equal(result.runtime, runtime);
      assert.equal(result.mcp_prefix, expected.mcp_prefix);
      assert.equal(result.plan_mode_native, expected.plan_mode_native);
      assert.deepEqual(result.agent_dispatch, expected.agent_dispatch);
      assert.deepEqual(result.delegation, {
        pattern: expected.agent_dispatch.pattern,
        constraints: expected.constraints,
      });
      assert.deepEqual(result.agents, expected.agents);
      assert.equal(result.workspace_suggestion, null);
      for (const [tool, mapped] of Object.entries(expected.tools)) {
        assert.equal(result.tools[tool], mapped, `${runtime} tools.${tool}`);
      }
    });
  }

  it('covers exactly the discovered runtimes', () => {
    assert.deepEqual(Object.keys(EXPECTED_CONTEXT).sort(), RUNTIME_NAMES);
  });

  it('reports agent capabilities from the agent registry', () => {
    const result = createHandler(getRuntimeConfig('claude'))({});

    assert.equal(result.agent_capabilities.architect, 'read_only');
    assert.equal(result.agent_capabilities.coder, 'full');
  });

  it('passes the workspace suggestion through', () => {
    const handler = createHandler(getRuntimeConfig('codex'), () => '/workspace/suggestion');

    assert.equal(handler({}).workspace_suggestion, '/workspace/suggestion');
  });

  it('defaults to kebab-case agents and empty runtime facts for a bare config', () => {
    const result = createHandler({ name: 'custom' })({});

    assert.deepEqual(result.agents, AGENT_NAMES);
    assert.deepEqual(result.agent_dispatch, { pattern: '', naming: 'kebab-case', prefix: '' });
    assert.deepEqual(result.delegation, { pattern: '', constraints: {} });
    assert.equal(result.mcp_prefix, '');
    assert.equal(result.plan_mode_native, false);
    assert.deepEqual(result.tools, {});
    assert.deepEqual(result.paths, {});
  });
});
