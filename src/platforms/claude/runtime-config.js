const telemetryAdapter = require('./telemetry-adapter');

module.exports = {
  name: 'claude',
  outputDir: 'claude/',
  telemetry: telemetryAdapter,

  agentNaming: 'kebab-case',

  env: {
    extensionPath: 'CLAUDE_PLUGIN_ROOT',
    workspacePath: 'CLAUDE_PROJECT_DIR',
  },

  content: {
    primary: 'filesystem',
    fallback: 'none',
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

  delegation: {
    pattern: 'Agent(subagent_type: "maestro:{{agent}}", prompt: "...")',
    dispatch: {
      mode: 'subagent_type',
      tool_name: 'Agent',
      agent_name_template: 'maestro:{{agent}}',
      agent_param: 'subagent_type',
      prompt_param: 'prompt',
      call_pattern: 'Agent(subagent_type: "maestro:<agent>", prompt: "<prompt>")',
    },
    constraints: {
      result_surface: 'synchronous',
      child_cannot_prompt_user: false,
    },
  },

  planMode: {
    ephemeralWriteRoots: [],
  },

  features: {
    exampleBlocks: true,
    claudeStateContract: true,
    scriptBasedStateContract: false,
    codexStateContract: false,
  },

  paths: {
    skills: '${CLAUDE_PLUGIN_ROOT}/skills/',
    hooks: '${CLAUDE_PLUGIN_ROOT}/scripts/',
  },
};
