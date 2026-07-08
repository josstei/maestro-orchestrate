import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const PLATFORMS_DIR = path.resolve(moduleDirname, '..', '..', 'platforms');

const RUNTIME_NAMES = fs.readdirSync(PLATFORMS_DIR, { withFileTypes: true })
  .filter((entry: any) => entry.isDirectory() && entry.name !== 'shared')
  .filter((entry: any) =>
    fs.existsSync(path.join(PLATFORMS_DIR, entry.name, 'runtime-config.js'))
  )
  .map((entry: any) => entry.name)
  .sort();

const configCache = Object.create(null);

for (const name of RUNTIME_NAMES) {
  const configPath = path.join(PLATFORMS_DIR, name, 'runtime-config.js');
  const { default: config } = await import(pathToFileURL(configPath).href);
  configCache[name] = config;
}

function loadRuntimeConfig(name: any) {
  return configCache[name];
}

function getRuntimeConfig(name: any) {
  if (!RUNTIME_NAMES.includes(name)) {
    throw new Error(`Unknown runtime config: ${name}`);
  }

  return loadRuntimeConfig(name);
}

function getDefaultRuntimeConfig() {
  const runtime = process.env.MAESTRO_RUNTIME;
  if (runtime && RUNTIME_NAMES.includes(runtime)) {
    return loadRuntimeConfig(runtime);
  }

  if (RUNTIME_NAMES.length === 0) {
    throw new Error('No runtime configs found in platforms/');
  }

  return loadRuntimeConfig(RUNTIME_NAMES[0]);
}

function isPlainObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeRuntimeConfig(base: any, override: any) {
  const merged = { ...base, ...override };

  for (const key of Object.keys(override)) {
    if (isPlainObject(base[key]) && isPlainObject(override[key])) {
      merged[key] = mergeRuntimeConfig(base[key], override[key]);
    }
  }

  return merged;
}

function normalizeRuntimeConfig(runtimeConfig: any) {
  if (!runtimeConfig) {
    return getDefaultRuntimeConfig();
  }

  if (typeof runtimeConfig === 'string') {
    return getRuntimeConfig(runtimeConfig);
  }

  if (typeof runtimeConfig === 'object' && runtimeConfig.name) {
    if (RUNTIME_NAMES.includes(runtimeConfig.name)) {
      return mergeRuntimeConfig(getRuntimeConfig(runtimeConfig.name), runtimeConfig);
    }

    return runtimeConfig;
  }

  return getDefaultRuntimeConfig();
}

export { getRuntimeConfig, getDefaultRuntimeConfig, normalizeRuntimeConfig };
