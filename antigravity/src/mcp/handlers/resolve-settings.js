'use strict';

const { resolveSetting } = require('../../config/setting-resolver');
const { MAESTRO_SETTINGS } = require('../../config/settings-catalog');

const KNOWN_SETTINGS = MAESTRO_SETTINGS.map((setting) => setting.envVar);

function handleResolveSettings(params, projectRoot) {
  const requested =
    Array.isArray(params.settings) && params.settings.length > 0
      ? params.settings.filter((name) => KNOWN_SETTINGS.includes(name))
      : KNOWN_SETTINGS;

  const settings = {};
  for (const name of requested) {
    settings[name] = resolveSetting(name, projectRoot) ?? null;
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

module.exports = {
  handleResolveSettings,
};
