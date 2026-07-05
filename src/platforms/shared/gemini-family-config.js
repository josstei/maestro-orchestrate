/**
 * Shared runtime-config base for the Gemini-family runtimes (Gemini CLI, Qwen Code).
 * Per-runtime files override name, outputDir, env, and tool-dialect entries.
 */
const GEMINI_FAMILY_BASE = Object.freeze({
  agentNaming: 'snake_case',

  tools: Object.freeze({
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
  }),

  agentFrontmatter: Object.freeze({
    kind: 'local',
    turnsField: 'max_turns',
    hasTemperature: true,
    hasTimeout: true,
  }),

  delegation: Object.freeze({
    pattern: '{{agent}}(query: "...")',
    constraints: Object.freeze({
      result_surface: 'synchronous',
      child_cannot_prompt_user: false,
    }),
  }),

  features: Object.freeze({
    exampleBlocks: false,
    mcpStateContract: true,
  }),

  paths: Object.freeze({
    skills: '${extensionPath}/skills/',
    hooks: '${extensionPath}/hooks/',
  }),
});

function buildGeminiFamilyConfig(overrides) {
  const { tools = {}, ...rest } = overrides;
  return {
    ...GEMINI_FAMILY_BASE,
    ...rest,
    tools: { ...GEMINI_FAMILY_BASE.tools, ...tools },
  };
}

export { GEMINI_FAMILY_BASE, buildGeminiFamilyConfig };
