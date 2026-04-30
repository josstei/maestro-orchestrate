'use strict';

const path = require('node:path');
const { buildMetadataContext } = require('./metadata-shared');

function loadMetadataBuilder(runtimeName) {
  return require(path.join(__dirname, runtimeName, 'metadata.js'));
}

function buildPlatformMetadataOutputs(runtimes, pkg) {
  const context = buildMetadataContext(pkg);
  const outputs = [];

  for (const runtimeName of Object.keys(runtimes).sort()) {
    const metadata = loadMetadataBuilder(runtimeName);
    if (typeof metadata.buildMetadataOutputs !== 'function') {
      continue;
    }

    outputs.push(...metadata.buildMetadataOutputs(context));
  }

  return outputs;
}

module.exports = {
  buildPlatformMetadataOutputs,
  loadMetadataBuilder,
};
