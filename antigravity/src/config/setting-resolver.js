'use strict';

const path = require('node:path');
const { parseEnvFile } = require('./env-file-parser');

/**
 * The first non-empty value of `varName` from the process environment, then
 * `<projectRoot>/.env`, then the extension's `.env`; each `.env` is parsed
 * only when every earlier source came up empty.
 * @param {string} varName
 * @param {string|null|undefined} projectRoot
 * @returns {string|undefined}
 */
function resolveSetting(varName, projectRoot) {
  if (process.env[varName]) return process.env[varName];

  // Intentionally bypasses the runtime-config abstraction: setting
  // resolution runs before a runtime is selected, so it cannot ask a
  // runtime-config for `env.extensionPath`. MAESTRO_EXTENSION_PATH is
  // the documented canonical override; CLAUDE_PLUGIN_ROOT is kept as a
  // fallback because Claude injects it automatically from the plugin
  // loader.
  const extensionRoot = process.env.MAESTRO_EXTENSION_PATH || process.env.CLAUDE_PLUGIN_ROOT;

  for (const root of [projectRoot, extensionRoot]) {
    if (!root) continue;
    const value = parseEnvFile(path.join(root, '.env'))[varName];
    if (value) return value;
  }
  return undefined;
}

module.exports = { resolveSetting };
