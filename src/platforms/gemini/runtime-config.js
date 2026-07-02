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
});
