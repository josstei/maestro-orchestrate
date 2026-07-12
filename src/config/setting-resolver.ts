import path from 'path';
import type { z } from 'zod';
import { parseEnvFile } from '../core/env-file-parser.js';
import { parseOrThrow } from '../core/zod-validation.js';
import { SETTINGS_SCHEMA } from './settings-schema.js';
import type { SettingName, SettingValue } from './settings-schema.js';
import { ValidationError } from '../lib/errors/index.js';

function isSettingName(varName: string): varName is SettingName {
  return Object.prototype.hasOwnProperty.call(SETTINGS_SCHEMA, varName);
}

function resolveSetting(varName: string, projectRoot?: string): string | undefined {
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

function parseSettingValue<N extends SettingName>(varName: N, value: unknown): SettingValue<N> {
  const schema = SETTINGS_SCHEMA[varName].schema as z.ZodType<SettingValue<N>, z.ZodTypeDef, unknown>;
  return parseOrThrow(schema, value, varName);
}

/**
 * Resolve a MAESTRO_* setting to its declared type, applying the schema
 * default when unset and validating any present value.
 * @throws {ValidationError} On an unknown setting name or an invalid value
 */
function resolveTypedSetting<N extends SettingName>(varName: N, projectRoot?: string): SettingValue<N> {
  if (!isSettingName(varName)) {
    throw new ValidationError(`Unknown setting "${varName}"`, { details: { varName } });
  }

  const spec = SETTINGS_SCHEMA[varName];

  const raw = resolveSetting(varName, projectRoot);
  if (raw === undefined) {
    return spec.default as SettingValue<N>;
  }

  return parseSettingValue(varName, raw);
}

export { parseSettingValue, resolveSetting, resolveTypedSetting };
