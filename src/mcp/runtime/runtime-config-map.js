'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PLATFORMS_DIR = path.resolve(__dirname, '..', '..', 'platforms');

const RUNTIME_NAMES = fs.readdirSync(PLATFORMS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
  .filter((entry) =>
    fs.existsSync(path.join(PLATFORMS_DIR, entry.name, 'runtime-config.js'))
  )
  .map((entry) => entry.name)
  .sort();

function loadRuntimeConfig(name) {
  return require(path.join(PLATFORMS_DIR, name, 'runtime-config.js'));
}

function getRuntimeConfig(name) {
  if (!RUNTIME_NAMES.includes(name)) {
    throw new Error(`Unknown runtime config: ${name}`);
  }

  return loadRuntimeConfig(name);
}

function getDefaultRuntimeConfig() {
  const runtime = process.env.MAESTRO_RUNTIME;
  if (runtime && RUNTIME_NAMES.includes(runtime)) {
    return loadRuntimeConfig(runtime);
  }

  return loadRuntimeConfig(RUNTIME_NAMES[0]);
}

function normalizeRuntimeConfig(runtimeConfig) {
  if (!runtimeConfig) {
    return getDefaultRuntimeConfig();
  }

  if (typeof runtimeConfig === 'string') {
    return getRuntimeConfig(runtimeConfig);
  }

  if (typeof runtimeConfig === 'object' && runtimeConfig.name) {
    return runtimeConfig;
  }

  return getDefaultRuntimeConfig();
}

module.exports = {
  RUNTIME_NAMES,
  getRuntimeConfig,
  getDefaultRuntimeConfig,
  normalizeRuntimeConfig,
};
