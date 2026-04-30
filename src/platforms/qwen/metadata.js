'use strict';

const {
  buildExtensionManifest,
  renderJson,
} = require('../metadata-shared');

function buildQwenExtensionManifest(context) {
  return buildExtensionManifest(context, {
    contextFileName: 'QWEN.md',
    runtime: 'qwen',
  });
}

function buildMetadataOutputs(context) {
  return [
    {
      outputPath: 'qwen-extension.json',
      content: renderJson(buildQwenExtensionManifest(context)),
    },
  ];
}

module.exports = {
  buildMetadataOutputs,
  buildQwenExtensionManifest,
};
