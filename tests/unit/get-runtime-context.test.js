'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { handleGetRuntimeContext } = require('../../src/mcp/handlers/get-runtime-context');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { AGENT_NAMES } = require('../../src/core/agent-registry');
const { toSnakeCase } = require('../../src/lib/naming');

// The get_runtime_context response is a contract the runtime prompts rely on,
// so the expected values are written out here instead of read from the configs.
const SYNCHRONOUS_CONSTRAINTS = { result_surface: 'synchronous', child_cannot_prompt_user: false };

const EXPECTED_CONTEXT = {
  antigravity: {
    mcp_prefix: 'mcp_maestro_maestro_',
    plan_mode_native: false,
    agent_dispatch: {
      pattern: 'invoke_subagent(Subagents: [{ TypeName: "{{agent}}", Role: "...", Prompt: "..." }])',
      naming: 'kebab-case',
      prefix: '',
    },
    // invoke_subagent returns conversation IDs; each child's final response
    // arrives later as a system message.
    constraints: { result_surface: 'notified', child_cannot_prompt_user: false },
    agents: AGENT_NAMES,
    paths: { skills: '${PLUGIN_ROOT}/skills/', hooks: '${PLUGIN_ROOT}/hooks/' },
    tools: {
      read_file: 'view_file',
      read_many_files: 'view_file',
      replace: 'replace_file_content',
      run_shell_command: 'run_command',
      ask_user: 'ask_question',
      write_todos: [],
      enter_plan_mode: [],
    },
  },
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
    paths: { skills: '${CLAUDE_PLUGIN_ROOT}/skills/', hooks: '${CLAUDE_PLUGIN_ROOT}/scripts/' },
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
    paths: { skills: './skills/', hooks: './scripts/' },
    tools: { read_file: 'direct file reads', run_shell_command: 'exec_command' },
  },
  qwen: {
    mcp_prefix: '',
    plan_mode_native: false,
    agent_dispatch: { pattern: '{{agent}}(query: "...")', naming: 'snake_case', prefix: '' },
    constraints: SYNCHRONOUS_CONSTRAINTS,
    agents: AGENT_NAMES.map(toSnakeCase),
    paths: { skills: '${extensionPath}/skills/', hooks: '${extensionPath}/hooks/' },
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

function runtimeContext(runtime, workspaceSuggestion = null) {
  return handleGetRuntimeContext({}, null, {
    runtimeConfig: getRuntimeConfig(runtime),
    workspace: { workspaceSuggestion: () => workspaceSuggestion },
  });
}

describe('get_runtime_context handler', () => {
  for (const [runtime, expected] of Object.entries(EXPECTED_CONTEXT)) {
    it(`reports the shipped ${runtime} runtime context`, () => {
      const result = runtimeContext(runtime);

      assert.equal(result.runtime, runtime);
      assert.equal(result.mcp_prefix, expected.mcp_prefix);
      assert.equal(result.plan_mode_native, expected.plan_mode_native);
      assert.deepEqual(result.agent_dispatch, expected.agent_dispatch);
      assert.deepEqual(result.delegation, {
        pattern: expected.agent_dispatch.pattern,
        constraints: expected.constraints,
      });
      assert.deepEqual(result.agents, expected.agents);
      assert.deepEqual(result.paths, expected.paths);
      assert.equal(result.workspace_suggestion, null);
      for (const [tool, mapped] of Object.entries(expected.tools)) {
        assert.deepEqual(result.tools[tool], mapped, `${runtime} tools.${tool}`);
      }
    });
  }

  it('covers exactly the discovered runtimes', () => {
    assert.deepEqual(Object.keys(EXPECTED_CONTEXT).sort(), RUNTIME_NAMES);
  });

  it('reports agent capabilities from the agent registry', () => {
    const result = runtimeContext('claude');

    assert.equal(result.agent_capabilities.architect, 'read_only');
    assert.equal(result.agent_capabilities.coder, 'full');
  });

  it('passes the workspace suggestion through', () => {
    assert.equal(runtimeContext('codex', '/workspace/suggestion').workspace_suggestion, '/workspace/suggestion');
  });

  it('reports its fields in a stable order', () => {
    assert.deepEqual(Object.keys(runtimeContext('claude')), [
      'runtime',
      'tools',
      'agent_dispatch',
      'delegation',
      'mcp_prefix',
      'paths',
      'agents',
      'agent_capabilities',
      'plan_mode_native',
      'workspace_suggestion',
    ]);
  });
});
