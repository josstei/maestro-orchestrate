'use strict';

const path = require('node:path');
const { parseEnvFile } = require('../core/env-file-parser');

// Setting resolution can precede runtime selection. Claude's injected plugin
// root remains the fallback for the canonical extension override.
const EXTENSION_ROOT_ENV_VARS = ['MAESTRO_EXTENSION_PATH', 'CLAUDE_PLUGIN_ROOT'];

/** Lazily snapshot each .env file for one request; process.env remains live. */
function createSettingResolver(projectRoot, { onWarning = (message) => console.warn(message) } = {}) {
  const files = new Map();

  function readSource(filePath) {
    if (!files.has(filePath)) {
      const warnings = [];
      const values = parseEnvFile(filePath, { onWarning: (message) => warnings.push(message) });
      files.set(filePath, { values, warnings });
    }
    const { values, warnings } = files.get(filePath);
    // Each logical source lookup used to parse and warn independently, even
    // when workspace and extension resolve to the same file.
    for (const warning of warnings) onWarning(warning);
    return values;
  }

  return function resolve(varName) {
    const extensionRoot = EXTENSION_ROOT_ENV_VARS.map((name) => process.env[name]).find(Boolean);

    // Skip files until higher-priority sources come up empty. Skipped sources
    // yield null (not {}) so no prototype lookup happens for them.
    const sources = [
      () => process.env,
      () => (typeof projectRoot === 'string' && projectRoot.length > 0
        ? readSource(path.join(projectRoot, '.env'))
        : null),
      () => (extensionRoot ? readSource(path.join(extensionRoot, '.env')) : null),
    ];
    for (const source of sources) {
      const value = source()?.[varName];
      if (value !== undefined && value !== '') return value;
    }

    return undefined;
  };
}

function resolveSetting(varName, projectRoot) {
  return createSettingResolver(projectRoot)(varName);
}

module.exports = { createSettingResolver, EXTENSION_ROOT_ENV_VARS, resolveSetting };
