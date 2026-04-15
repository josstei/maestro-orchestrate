module.exports = {
  name: 'qwen',
  outputDir: 'qwen/',

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

  delegationPattern: '{{agent}}(query: "...")',

  features: {
    mcpSkillContentHandler: true,
    policyEnforcer: false,
    exampleBlocks: false,
    geminiHookModel: true,
    claudeHookModel: false,
    geminiDelegation: true,
    claudeDelegation: false,
    codexDelegation: false,
    geminiToolExamples: true,
    claudeToolExamples: false,
    geminiAskFormat: true,
    geminiStateContract: true,
    claudeStateContract: false,
    codexStateContract: false,
    geminiRuntimeConfig: false,
    claudeRuntimeConfig: false,
    codexRuntimeConfig: false,
    qwenRuntimeConfig: true,
  },

  paths: {
    skills: '${extensionPath}/skills/',
    hooks: '${extensionPath}/hooks/',
  },
};
