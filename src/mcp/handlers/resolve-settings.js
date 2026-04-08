'use strict';

const { resolveSetting } = require('../../config/setting-resolver');

const KNOWN_SETTINGS = [
  'MAESTRO_DISABLED_AGENTS',
  'MAESTRO_MAX_RETRIES',
  'MAESTRO_AUTO_ARCHIVE',
  'MAESTRO_VALIDATION_STRICTNESS',
  'MAESTRO_STATE_DIR',
  'MAESTRO_MAX_CONCURRENT',
  'MAESTRO_EXECUTION_MODE',
];

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
  KNOWN_SETTINGS,
  handleResolveSettings,
};
