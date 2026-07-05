import { resolveSetting } from '../../config/setting-resolver.js';
import { SETTINGS_SCHEMA, SETTING_NAMES } from '../../config/settings-schema.js';
import { coerceScalar, assertValid } from '../../lib/schema/index.js';
const KNOWN_SETTINGS = SETTING_NAMES;

function handleResolveSettings(params, projectRoot) {
  const requested =
    Array.isArray(params.settings) && params.settings.length > 0
      ? params.settings.filter((name) => KNOWN_SETTINGS.includes(name))
      : KNOWN_SETTINGS;

  const settings = {};
  for (const name of requested) {
    const raw = resolveSetting(name, projectRoot);
    if (raw !== undefined) {
      const spec = SETTINGS_SCHEMA[name];
      assertValid(spec.schema, coerceScalar(spec.schema, raw), name);
    }
    settings[name] = raw ?? null;
  }

  return {
    settings,
    disabled_agents: settings.MAESTRO_DISABLED_AGENTS
      ? settings.MAESTRO_DISABLED_AGENTS.split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : [],
  };
}

export { KNOWN_SETTINGS, handleResolveSettings };
