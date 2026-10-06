'use strict';

const path = require('path');
const { parseEnvFile } = require('../core/env-file-parser');

function resolveSetting(varName, projectRoot) {
  // Intentionally bypasses the runtime-config abstraction: setting
  // resolution runs before a runtime is selected, so it cannot ask a
  // runtime-config for `env.extensionPath`. MAESTRO_EXTENSION_PATH is
  // the documented canonical override; CLAUDE_PLUGIN_ROOT is kept as a
  // fallback because Claude injects it automatically from the plugin
  // loader.
  const extensionRoot = process.env.MAESTRO_EXTENSION_PATH || process.env.CLAUDE_PLUGIN_ROOT;

  // Sources in precedence order; each .env file is parsed only when every
  // earlier source came up empty. Skipped sources yield null (not {}) so no
  // prototype lookup happens for them.
  const sources = [
    () => process.env,
    () => (typeof projectRoot === 'string' && projectRoot.length > 0
      ? parseEnvFile(path.join(projectRoot, '.env'))
      : null),
    () => (extensionRoot ? parseEnvFile(path.join(extensionRoot, '.env')) : null),
  ];
  for (const readSource of sources) {
    const value = readSource()?.[varName];
    if (value !== undefined && value !== '') return value;
  }

  return undefined;
}

module.exports = { resolveSetting };
