'use strict';

const path = require('path');
const { parseEnvFile } = require('../core/env-file-parser');

function resolveSetting(varName, projectRoot) {
  const envValue = process.env[varName];
  if (envValue !== undefined && envValue !== '') return envValue;

  const projectEnv = parseEnvFile(path.join(projectRoot, '.env'));
  if (projectEnv[varName] !== undefined && projectEnv[varName] !== '') return projectEnv[varName];

  const extensionRoot = process.env.MAESTRO_EXTENSION_PATH || process.env.CLAUDE_PLUGIN_ROOT;
  if (extensionRoot) {
    const extEnv = parseEnvFile(path.join(extensionRoot, '.env'));
    if (extEnv[varName] !== undefined && extEnv[varName] !== '') return extEnv[varName];
  }

  return undefined;
}

module.exports = { resolveSetting };
