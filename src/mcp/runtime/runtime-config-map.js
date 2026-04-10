'use strict';

const gemini = require('../../platforms/gemini/runtime-config');
const claude = require('../../platforms/claude/runtime-config');
const codex = require('../../platforms/codex/runtime-config');

const RUNTIME_CONFIG_MAP = Object.freeze({
  gemini,
  claude,
  codex,
});

function getRuntimeConfig(name) {
  const config = RUNTIME_CONFIG_MAP[name];

  if (!config) {
    throw new Error(`Unknown runtime config: ${name}`);
  }

  return config;
}

function getDefaultRuntimeConfig() {
  return RUNTIME_CONFIG_MAP.gemini;
}

function listRuntimeConfigs() {
  return Object.keys(RUNTIME_CONFIG_MAP);
}

module.exports = {
  RUNTIME_CONFIG_MAP,
  getRuntimeConfig,
  getDefaultRuntimeConfig,
  listRuntimeConfigs,
};
