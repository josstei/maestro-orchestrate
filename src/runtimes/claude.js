module.exports = {
  name: 'claude',
  outputDir: 'claude/',

  agentNaming: 'kebab-case',

  env: {
    extensionPath: 'CLAUDE_PLUGIN_ROOT',
    workspacePath: 'CLAUDE_PROJECT_DIR',
  },

  tools: {
    read_file: 'Read',
    list_directory: 'Glob',
    glob: 'Glob',
    grep_search: 'Grep',
    google_web_search: 'WebSearch',
    web_fetch: 'WebFetch',
    write_file: 'Write',
    replace: 'Edit',
    run_shell_command: 'Bash',
    ask_user: 'AskUserQuestion',
    read_many_files: 'Read',
    write_todos: ['TaskCreate', 'TaskUpdate', 'TaskList'],
    activate_skill: 'Skill',
    enter_plan_mode: 'EnterPlanMode',
    exit_plan_mode: 'ExitPlanMode',
    codebase_investigator: 'Agent (Explore) / Grep / Glob',
  },

  agentFrontmatter: {
    model: 'inherit',
    turnsField: 'maxTurns',
  },

  delegationPattern: 'Agent(subagent_type: "maestro:{{agent}}", prompt: "...")',

  features: {
    mcpSkillContentHandler: false,
    policyEnforcer: true,
    exampleBlocks: true,
    geminiHookModel: false,
    claudeHookModel: true,
    geminiDelegation: false,
    claudeDelegation: true,
    codexDelegation: false,
    geminiToolExamples: false,
    claudeToolExamples: true,
    geminiAskFormat: false,
    geminiStateContract: false,
    claudeStateContract: true,
    codexStateContract: false,
  },

  paths: {
    skills: '${CLAUDE_PLUGIN_ROOT}/skills/',
    hooks: '${CLAUDE_PLUGIN_ROOT}/scripts/',
  },
};
