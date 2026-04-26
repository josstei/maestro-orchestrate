module.exports = {
  name: 'gemini',
  outputDir: './',

  agentNaming: 'snake_case',

  env: {
    extensionPath: 'extensionPath',
    workspacePath: null,
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
    google_web_search: 'google_web_search',
    web_fetch: 'web_fetch',
    write_file: 'write_file',
    replace: 'replace',
    run_shell_command: 'run_shell_command',
    ask_user: 'ask_user',
    read_many_files: 'read_file (called per-file)',
    write_todos: 'not available — track progress in model context',
    activate_skill: 'activate_skill',
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
