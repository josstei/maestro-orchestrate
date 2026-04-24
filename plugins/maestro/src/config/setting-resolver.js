'use strict';

const path = require('node:path');
const { parseEnvFile } = require('../core/env-file-parser');

function resolveSetting(varName, projectRoot) {
  const envValue = process.env[varName];
  if (envValue !== undefined && envValue !== '') return envValue;

  if (typeof projectRoot === 'string' && projectRoot.length > 0) {
    const projectEnv = parseEnvFile(path.join(projectRoot, '.env'));
    if (projectEnv[varName] !== undefined && projectEnv[varName] !== '') {
      return projectEnv[varName];
    }
  }

  // Intentionally bypasses the runtime-config abstraction: setting
  // resolution runs before a runtime is selected, so it cannot ask a
  // runtime-config for `env.extensionPath`. MAESTRO_EXTENSION_PATH is
  // the documented canonical override; CLAUDE_PLUGIN_ROOT is kept as a
  // fallback because Claude injects it automatically from the plugin
  // loader.
  const extensionRoot = process.env.MAESTRO_EXTENSION_PATH || process.env.CLAUDE_PLUGIN_ROOT;
  if (extensionRoot) {
    const extEnv = parseEnvFile(path.join(extensionRoot, '.env'));
    if (extEnv[varName] !== undefined && extEnv[varName] !== '') return extEnv[varName];
  }

  return undefined;
}

module.exports = { resolveSetting };
