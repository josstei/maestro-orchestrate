module.exports = {
  name: 'codex',
  outputDir: 'plugins/maestro/',

  agentNaming: 'kebab-case',

  env: {
    extensionPath: '.',
    workspacePath: 'MAESTRO_WORKSPACE_PATH',
  },

  relativeExtensionPath: true,

  content: {
    primary: 'filesystem',
    fallback: 'none',
  },

  tools: {
    read_file: 'direct file reads',
    list_directory: 'exec_command (`rg --files` or `ls`)',
    glob: 'exec_command (`rg --files` or `find`)',
    grep_search: 'exec_command (`rg`)',
    google_web_search: 'web search',
    web_fetch: 'web fetch',
    write_file: 'apply_patch',
    replace: 'apply_patch',
    run_shell_command: 'exec_command',
    ask_user: 'request_user_input',
    read_many_files: 'direct file reads',
    write_todos: 'update_plan',
    activate_skill: 'open the referenced skill and follow it',
    enter_plan_mode: 'update_plan',
    exit_plan_mode: 'request_user_input approval',
    codebase_investigator: 'local inspection or spawn_agent',
  },

  delegationPattern: 'spawn_agent(...)',

  features: {
    mcpSkillContentHandler: true,
    policyEnforcer: false,
    exampleBlocks: false,
    geminiHookModel: false,
    claudeHookModel: false,
    geminiDelegation: false,
    claudeDelegation: false,
    codexDelegation: true,
    geminiToolExamples: false,
    claudeToolExamples: false,
    geminiAskFormat: false,
    geminiStateContract: false,
    claudeStateContract: false,
    codexStateContract: true,
    geminiRuntimeConfig: false,
    claudeRuntimeConfig: false,
    codexRuntimeConfig: true,
  },

  paths: {
    skills: './skills/',
    hooks: './scripts/',
  },
};
