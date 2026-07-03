'use strict';

const path = require('path');
const { parseEnvFile } = require('../core/env-file-parser');
const { SETTINGS_SCHEMA } = require('./settings-schema');
const { coerceScalar, assertValid } = require('../lib/schema');
const { ValidationError } = require('../lib/errors');

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

/**
 * Resolve a MAESTRO_* setting to its declared type, applying the schema
 * default when unset and validating any present value.
 * @param {string} varName - A key of SETTINGS_SCHEMA
 * @param {string} [projectRoot] - Project root for .env resolution
 * @returns {*} Coerced typed value, or the declared default when unset
 * @throws {ValidationError} On an unknown setting name or an invalid value
 */
function resolveTypedSetting(varName, projectRoot) {
  const spec = SETTINGS_SCHEMA[varName];
  if (!spec) {
    throw new ValidationError(`Unknown setting "${varName}"`, { details: { varName } });
  }

  const raw = resolveSetting(varName, projectRoot);
  if (raw === undefined) {
    return spec.default;
  }

  const value = coerceScalar(spec.schema, raw);
  assertValid(spec.schema, value, varName);
  return value;
}

module.exports = { resolveSetting, resolveTypedSetting };
