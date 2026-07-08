import type { RuntimeConfig } from '../runtime-descriptor.js';

export default {
  name: 'claude',
  outputDir: 'claude/',

  agentNaming: 'kebab-case',

  mcpPrefix: 'mcp__plugin_maestro_maestro__',
  plan_mode_native: true,

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

  delegation: {
    pattern: 'Agent(subagent_type: "maestro:{{agent}}", prompt: "...")',
    constraints: {
      result_surface: 'synchronous',
      child_cannot_prompt_user: false,
    },
  },

  features: {
    exampleBlocks: true,
    mcpStateContract: true,
  },

  paths: {
    skills: '${CLAUDE_PLUGIN_ROOT}/claude/skills/',
    hooks: '${CLAUDE_PLUGIN_ROOT}/claude/scripts/',
  },

  generation: {
    entryPoint: {
      templateFile: 'claude-skill.md.tmpl',
      outputPath: (entry) => `claude/skills/${entry.name}/SKILL.md`,
      preamblePlaceholder: 'protocol_block',
    },
    coreCommand: {
      templateFile: 'claude-core-command.md.tmpl',
      outputPath: (entry) => `claude/skills/${entry.name}/SKILL.md`,
    },
    hooks: {
      family: 'claude',
      configOutputPath: 'claude/hooks/claude-hooks.json',
    },
  },
} satisfies RuntimeConfig;
