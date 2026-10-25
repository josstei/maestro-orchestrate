'use strict';

module.exports = {
  name: 'antigravity',
  // `agy plugin install` copies one plugin directory, so the plugin root
  // (plugin.json, mcp_config.json, hooks.json, agents/, skills/ and the
  // bundled src/) is its own directory.
  outputDir: 'antigravity/',

  agentNaming: 'kebab-case',

  // clientInfo.name Antigravity's MCP client sends in initialize (observed
  // from the agy 1.4.2 CLI); the server identifies its host runtime by it.
  mcpClientNames: ['antigravity-client'],

  // Antigravity registers a plugin's MCP server as `<plugin dir>_<server>`
  // (maestro_maestro) and exposes each tool marked always-loaded (mcpToolMeta)
  // as a native tool named `mcp_<server>_<tool>`.
  mcpPrefix: 'mcp_maestro_maestro_',
  mcpToolMeta: { 'antigravity/alwaysLoad': true },
  planModeNative: false,

  env: {
    extensionPath: 'PLUGIN_ROOT',
    workspacePath: 'MAESTRO_WORKSPACE_PATH',
  },

  // Agent stubs list the mapped names of the tools an agent declares as that
  // subagent's tool allowlist, so every tool an agent can declare must map to
  // real Antigravity tool names; [] means no equivalent. list_dir,
  // find_by_name and grep_search exist only for subagents that list them; the
  // main agent searches with run_command (the core-command preamble says so).
  // codebase_investigator is never declared by an agent and only guides the
  // orchestrator.
  tools: {
    read_file: 'view_file',
    list_directory: 'list_dir',
    glob: 'find_by_name',
    grep_search: 'grep_search',
    google_web_search: 'search_web',
    web_fetch: 'read_url_content',
    write_file: 'write_to_file',
    replace: 'replace_file_content',
    run_shell_command: 'run_command',
    ask_user: 'ask_question',
    read_many_files: 'view_file',
    write_todos: [],
    activate_skill: 'view_file',
    enter_plan_mode: [],
    exit_plan_mode: [],
    codebase_investigator: 'invoke_subagent (TypeName: "research")',
  },

  agentFrontmatter: {
    subagent: true,
    mainAgent: false,
    model: 'inherit',
    fields: ['name', 'description', 'subagent', 'mainAgent', 'model', 'tools'],
  },

  delegation: {
    pattern: 'invoke_subagent(Subagents: [{ TypeName: "{{agent}}", Role: "...", Prompt: "..." }])',
    constraints: {
      result_surface: 'notified',
      child_cannot_prompt_user: false,
    },
  },

  features: {
    exampleBlocks: false,
    claudeStateContract: false,
    scriptBasedStateContract: true,
    codexStateContract: false,
  },

  paths: {
    skills: '${PLUGIN_ROOT}/skills/',
    hooks: '${PLUGIN_ROOT}/hooks/',
  },

  // Generated launchers, relative to outputDir.
  launchers: {
    mcpServer: 'mcp/maestro-server.js',
    hookRunner: 'hooks/hook-runner.js',
    policyEnforcer: 'hooks/policy-enforcer.js',
  },
};
