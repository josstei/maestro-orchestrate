import { buildGeminiFamilyConfig } from '../shared/gemini-family-config.js';

const AGY_RUNTIME_CONFIG = buildGeminiFamilyConfig({
  name: 'agy',
  outputDir: 'agy/',
  mcpPrefix: 'mcp_maestro_',
  plan_mode_native: true,
  env: { extensionPath: 'extensionPath', workspacePath: null },
  agentToolDialect: {
    read_file: 'view_file',
    write_file: 'write_to_file',
    replace: 'replace_file_content',
    run_shell_command: 'run_command',
    list_directory: 'list_dir',
    google_web_search: 'search_web',
    web_fetch: 'read_url_content',
    ask_user: 'ask_question',
    write_todos: 'write_todos',
  },
  tools: {
    write_todos: 'write_todos',
  },
  generation: {
    entryPoint: {
      templateFile: 'gemini-command.toml.tmpl',
      outputPath: (entry) => `commands/agy/${entry.name}.toml`,
      preamblePlaceholder: 'skills_block',
    },
    coreCommand: {
      templateFile: 'gemini-core-command.toml.tmpl',
      outputPath: (entry) => `commands/agy/${entry.name}.toml`,
    },
    hooks: {
      family: 'gemini-family',
      configOutputPath: 'agy/hooks.json',
    },
  },
  hooks: {
    events: {
      'session-start': 'SessionStart',
      'before-agent': 'BeforeAgent',
      'after-agent': 'AfterAgent',
      'session-end': 'SessionEnd',
    },
    nameSuffix: '',
    descriptionSuffix: ' (AGY)',
  },
  contextFile: {
    outputPath: 'AGY.md',
    displayName: 'Antigravity CLI (AGY)',
    subagentPrerequisite: 'Antigravity CLI natively supports subagents. Verify `~/.gemini/antigravity-cli/settings.json`.',
    extensionHome: '~/.gemini/antigravity-cli/extensions/maestro',
    extensionManifest: 'agy-extension.json',
    hooksConfigPath: 'agy/hooks.json',
    includeToolMappingTable: false,
    commandDir: 'commands/agy',
    commandNamespace: 'maestro',
    toolNames: { askUser: 'ask_user', writeTodos: 'write_todos', replace: 'replace' },
  },
});

export { AGY_RUNTIME_CONFIG };
export default AGY_RUNTIME_CONFIG;
