const { buildGeminiFamilyConfig } = require('../shared/gemini-family-config');

module.exports = buildGeminiFamilyConfig({
  name: 'gemini',
  outputDir: './',
  env: { extensionPath: 'extensionPath', workspacePath: null },
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
