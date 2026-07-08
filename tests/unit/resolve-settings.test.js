import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleResolveSettings, KNOWN_SETTINGS } from '../../dist/src/mcp/handlers/resolve-settings.js';
import { SETTING_NAMES } from '../../dist/src/config/settings-schema.js';

function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) previous[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('handleResolveSettings', () => {
  it('derives KNOWN_SETTINGS from the settings schema', () => {
    assert.deepEqual([...KNOWN_SETTINGS].sort(), [...SETTING_NAMES].sort());
  });

  it('returns the raw value and splits disabled_agents', () => {
    const result = withEnv(
      { MAESTRO_DISABLED_AGENTS: 'architect, tester', MAESTRO_EXTENSION_PATH: null },
      () => handleResolveSettings({ settings: ['MAESTRO_DISABLED_AGENTS'] }, undefined)
    );
    assert.equal(result.settings.MAESTRO_DISABLED_AGENTS, 'architect, tester');
    assert.deepEqual(result.disabled_agents, ['architect', 'tester']);
  });

  it('rejects an invalid present value', () => {
    assert.throws(
      () =>
        withEnv(
          { MAESTRO_EXECUTION_MODE: 'bogus', MAESTRO_EXTENSION_PATH: null },
          () => handleResolveSettings({ settings: ['MAESTRO_EXECUTION_MODE'] }, undefined)
        ),
      (err) => {
        assert.equal(err.name, 'ValidationError');
        return true;
      }
    );
  });

  it('leaves an unset setting as null without validating', () => {
    const result = withEnv(
      { MAESTRO_MAX_RETRIES: null, MAESTRO_EXTENSION_PATH: null },
      () => handleResolveSettings({ settings: ['MAESTRO_MAX_RETRIES'] }, undefined)
    );
    assert.equal(result.settings.MAESTRO_MAX_RETRIES, null);
  });
});
