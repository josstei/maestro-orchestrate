'use strict';

const path = require('path');

const RUNTIME_NAMES = ['gemini', 'claude', 'codex'];
const DEFAULT_RUNTIME = 'gemini';

const configCache = Object.create(null);

function loadRuntimeConfig(name) {
  if (configCache[name]) {
    return configCache[name];
  }

  const configPath = path.resolve(__dirname, '..', '..', 'platforms', name, 'runtime-config.js');
  const config = require(configPath);
  configCache[name] = config;
  return config;
}

function getRuntimeConfig(name) {
  if (!RUNTIME_NAMES.includes(name)) {
    throw new Error(`Unknown runtime config: ${name}`);
  }

  return loadRuntimeConfig(name);
}

function getDefaultRuntimeConfig() {
  const runtime = process.env.MAESTRO_RUNTIME || DEFAULT_RUNTIME;
  return loadRuntimeConfig(RUNTIME_NAMES.includes(runtime) ? runtime : DEFAULT_RUNTIME);
}

function listRuntimeConfigs() {
  return RUNTIME_NAMES.slice();
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
  getRuntimeConfig,
  getDefaultRuntimeConfig,
  listRuntimeConfigs,
  normalizeRuntimeConfig,
};
