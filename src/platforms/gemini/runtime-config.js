const { buildGeminiFamilyConfig } = require('../shared/gemini-family-config');

module.exports = buildGeminiFamilyConfig({
  name: 'gemini',
  outputDir: './',
  env: { extensionPath: 'extensionPath', workspacePath: null },
});
