'use strict';

module.exports = {
  name: 'qwen',
  // Qwen Code loads an extension's subagents from <extension>/agents/, and the
  // repo root is Qwen's extension dir.
  outputDir: './',

  agentNaming: 'snake_case',

  // Qwen Code sends clientInfo.name `qwen-cli-mcp-client-<server key>` in MCP
  // initialize; the server identifies its host runtime by it.
  mcpClientNames: ['qwen-cli-mcp-client-*'],

  mcpPrefix: '',
  planModeNative: false,

  env: {
    extensionPath: 'extensionPath',
    // qwen-extension.json exports Qwen's ${workspacePath} under this name.
    workspacePath: 'MAESTRO_WORKSPACE_PATH',
  },

  tools: {
    read_file: 'read_file',
    list_directory: 'list_directory',
    glob: 'glob',
    grep_search: 'grep_search',
    google_web_search: 'web_search',
    web_fetch: 'web_fetch',
    write_file: 'write_file',
    replace: 'edit',
    run_shell_command: 'run_shell_command',
    ask_user: 'ask_user_question',
    read_many_files: 'read_many_files',
    write_todos: 'todo_write',
    activate_skill: 'skill',
    enter_plan_mode: 'enter_plan_mode',
    exit_plan_mode: 'exit_plan_mode',
    codebase_investigator: 'codebase_investigator',
  },

  agentFrontmatter: {
    kind: 'local',
    turnsField: 'max_turns',
    fields: ['name', 'kind', 'description', 'turns', 'tools'],
  },

  // Entry points are TOML commands, invoked as /maestro:<name>.
  entrySurface: 'command',

  delegation: {
    pattern: '{{agent}}(query: "...")',
    constraints: {
      result_surface: 'synchronous',
      child_cannot_prompt_user: false,
    },
  },

  features: {
    exampleBlocks: false,
    scriptBasedStateContract: true,
    codexStateContract: false,
  },

  paths: {
    skills: '${extensionPath}/skills/',
    hooks: '${extensionPath}/hooks/',
  },

  // Generated launchers, relative to outputDir.
  launchers: {
    mcpServer: 'mcp/maestro-server.js',
    hookRunner: 'hooks/hook-runner.js',
  },
};
