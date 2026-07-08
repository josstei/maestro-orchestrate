import { buildGeminiFamilyConfig } from '../shared/gemini-family-config.js';

export default buildGeminiFamilyConfig({
  name: 'gemini',
  outputDir: './',
  mcpPrefix: 'mcp_maestro_',
  plan_mode_native: true,
  env: { extensionPath: 'extensionPath', workspacePath: null },
  agentToolDialect: {},
  generation: {
    entryPoint: {
      templateFile: 'gemini-command.toml.tmpl',
      outputPath: (entry) => `commands/maestro/${entry.name}.toml`,
      preamblePlaceholder: 'skills_block',
    },
    coreCommand: {
      templateFile: 'gemini-core-command.toml.tmpl',
      outputPath: (entry) => `commands/maestro/${entry.name}.toml`,
    },
    hooks: {
      family: 'gemini-family',
      configOutputPath: 'hooks/hooks.json',
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
    descriptionSuffix: '',
  },
  contextFile: {
    outputPath: 'GEMINI.md',
    displayName: 'Gemini CLI',
    subagentPrerequisite: 'Verify `experimental.enableAgents` is `true` in `~/.gemini/settings.json`.',
    extensionHome: '~/.gemini/extensions/maestro',
    extensionManifest: 'gemini-extension.json',
    hooksConfigPath: 'hooks/hooks.json',
    includeToolMappingTable: false,
    toolNames: { askUser: 'ask_user', writeTodos: 'write_todos', replace: 'replace' },
  },
});
