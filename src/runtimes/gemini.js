module.exports = {
  name: 'gemini',
  outputDir: './',

  agentNaming: 'snake_case',

  env: {
    extensionPath: 'MAESTRO_EXTENSION_PATH',
    workspacePath: 'MAESTRO_WORKSPACE_PATH',
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
    read_many_files: 'read_many_files',
    write_todos: 'write_todos',
    activate_skill: 'activate_skill',
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
    geminiToolExamples: true,
    claudeToolExamples: false,
    geminiAskFormat: true,
    geminiStateContract: true,
    claudeStateContract: false,
  },

  paths: {
    skills: '${extensionPath}/skills/',
    hooks: '${extensionPath}/hooks/',
  },
};
