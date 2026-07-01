'use strict';

const path = require('path');
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

  // Setting resolution has one extension-root input. Runtime adapters may
  // normalize host-specific variables before this resolver runs.
  const extensionRoot = process.env.MAESTRO_EXTENSION_PATH;
  if (extensionRoot) {
    const extEnv = parseEnvFile(path.join(extensionRoot, '.env'));
    if (extEnv[varName] !== undefined && extEnv[varName] !== '') return extEnv[varName];
  }

  return undefined;
}

module.exports = { resolveSetting };
