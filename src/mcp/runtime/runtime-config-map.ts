import {
  getRuntimeConfig as getCatalogRuntimeConfig,
  getRuntimeDefinition,
} from '../../platforms/runtime-declarations.js';

function loadRuntimeConfig(name: string) {
  return getCatalogRuntimeConfig(name);
}

function getRuntimeConfig(name: any) {
  if (typeof name !== 'string' || !getRuntimeDefinition(name)) {
    throw new Error(`Unknown runtime config: ${name}`);
  }

  return loadRuntimeConfig(name);
}

function getDefaultRuntimeConfig() {
  const runtime = process.env.MAESTRO_RUNTIME;
  if (runtime && getRuntimeDefinition(runtime)) {
    return loadRuntimeConfig(runtime);
  }

  return loadRuntimeConfig('claude');
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
    if (getRuntimeDefinition(runtimeConfig.name)) {
      return mergeRuntimeConfig(getRuntimeConfig(runtimeConfig.name), runtimeConfig);
    }

    return runtimeConfig;
  }

  return getDefaultRuntimeConfig();
}

export { getRuntimeConfig, getDefaultRuntimeConfig, normalizeRuntimeConfig };
