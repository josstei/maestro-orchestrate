import { parseSettingValue, resolveSetting } from '../../config/setting-resolver.js';
import { SETTINGS_SCHEMA, SETTING_NAMES } from '../../config/settings-schema.js';
import type { EffectiveSettings, SettingName } from '../../config/settings-schema.js';
const KNOWN_SETTINGS = SETTING_NAMES;

interface ResolveSettingsParams {
  readonly settings?: readonly string[] | undefined;
}

type RawSettings = Partial<Record<SettingName, string | null>>;

export interface ResolveSettingsResult {
  readonly settings: RawSettings;
  readonly effective_settings: EffectiveSettings;
  readonly disabled_agents: string[];
}

function isSettingName(name: string): name is SettingName {
  return KNOWN_SETTINGS.includes(name as SettingName);
}

function assignEffectiveSetting<N extends SettingName>(
  settings: EffectiveSettings,
  name: N,
  value: EffectiveSettings[N],
): void {
  settings[name] = value;
}

function handleResolveSettings(
  params: ResolveSettingsParams,
  projectRoot: string | null,
): ResolveSettingsResult {
  const requested =
    Array.isArray(params.settings) && params.settings.length > 0
      ? params.settings.filter(isSettingName)
      : KNOWN_SETTINGS;

  const settings: RawSettings = {};
  const effectiveSettings: EffectiveSettings = {};
  for (const name of requested) {
    const raw = resolveSetting(name, projectRoot ?? undefined);
    settings[name] = raw ?? null;
    const spec = SETTINGS_SCHEMA[name];
    const effectiveValue = raw === undefined
      ? spec.default
      : parseSettingValue(name, raw);
    assignEffectiveSetting(effectiveSettings, name, effectiveValue);
  }

  return {
    settings,
    effective_settings: effectiveSettings,
    disabled_agents: settings.MAESTRO_DISABLED_AGENTS
      ? settings.MAESTRO_DISABLED_AGENTS.split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : [],
  };
}

export { KNOWN_SETTINGS, handleResolveSettings };
