'use strict';

const {
  buildExtensionManifest,
  renderJson,
} = require('../metadata-shared');

function buildGeminiExtensionManifest(context) {
  return buildExtensionManifest(context, {
    contextFileName: 'GEMINI.md',
    runtime: 'gemini',
  });
}

function buildMetadataOutputs(context) {
  return [
    {
      outputPath: 'gemini-extension.json',
      content: renderJson(buildGeminiExtensionManifest(context)),
    },
  ];
}

module.exports = {
  buildGeminiExtensionManifest,
  buildMetadataOutputs,
};
