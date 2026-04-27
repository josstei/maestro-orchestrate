const telemetryAdapter = require('./telemetry-adapter');

module.exports = {
  name: 'qwen',
  outputDir: 'qwen/',
  telemetry: telemetryAdapter,

  agentNaming: 'snake_case',

  env: {
    extensionPath: 'extensionPath',
    workspacePath: 'workspacePath',
  },

  content: {
    primary: 'filesystem',
    fallback: 'none',
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
    hasTemperature: true,
    hasTimeout: true,
  },

  delegation: {
    pattern: 'invoke_agent({agent_name: "<name>", prompt: "<prompt>"})',
    surface_tool: 'invoke_agent',
    requires_frontmatter_enforcement: false,
    constraints: {
      result_surface: 'synchronous',
      child_cannot_prompt_user: false,
    },
  },

  planMode: {
    ephemeralWriteRoots: [
      { homeRelative: ['.qwen', 'tmp'] },
    ],
  },

  features: {
    exampleBlocks: false,
    claudeStateContract: false,
    scriptBasedStateContract: true,
    codexStateContract: false,
  },

  paths: {
    skills: '${extensionPath}/skills/',
    hooks: '${extensionPath}/hooks/',
  },
};
