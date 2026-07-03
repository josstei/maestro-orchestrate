'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SETTINGS_SCHEMA,
  SETTING_NAMES,
  EXECUTION_MODES,
  VALIDATION_STRICTNESS_LEVELS,
} = require('../../src/config/settings-schema');
const { assertValid, coerceScalar } = require('../../src/lib/schema');

describe('settings-schema', () => {
  it('declares the eight MAESTRO_* settings', () => {
    assert.deepEqual(SETTING_NAMES.sort(), [
      'MAESTRO_AUTO_ARCHIVE',
      'MAESTRO_DISABLED_AGENTS',
      'MAESTRO_EXECUTION_MODE',
      'MAESTRO_MAX_CONCURRENT',
      'MAESTRO_MAX_RETRIES',
      'MAESTRO_MEMORY_INJECTION',
      'MAESTRO_STATE_DIR',
      'MAESTRO_VALIDATION_STRICTNESS',
    ]);
  });

  it('gives every setting a schema and a default', () => {
    for (const name of SETTING_NAMES) {
      assert.ok(SETTINGS_SCHEMA[name].schema, `${name} has a schema`);
      assert.ok('default' in SETTINGS_SCHEMA[name], `${name} declares a default`);
    }
  });

  it('grounds the enum members and key defaults', () => {
    assert.deepEqual(EXECUTION_MODES, ['ask', 'parallel', 'sequential']);
    assert.deepEqual(VALIDATION_STRICTNESS_LEVELS, ['strict', 'normal', 'lenient']);
    assert.equal(SETTINGS_SCHEMA.MAESTRO_STATE_DIR.default, 'docs/maestro');
    assert.equal(SETTINGS_SCHEMA.MAESTRO_EXECUTION_MODE.default, 'ask');
    assert.equal(SETTINGS_SCHEMA.MAESTRO_MAX_CONCURRENT.default, 0);
    assert.equal(SETTINGS_SCHEMA.MAESTRO_AUTO_ARCHIVE.default, false);
    assert.deepEqual(SETTINGS_SCHEMA.MAESTRO_DISABLED_AGENTS.default, []);
    assert.equal(SETTINGS_SCHEMA.MAESTRO_MEMORY_INJECTION.default, true);
  });

  it('each default satisfies its own schema', () => {
    for (const name of SETTING_NAMES) {
      const { schema, default: value } = SETTINGS_SCHEMA[name];
      assert.doesNotThrow(() => assertValid(schema, value, name), `${name} default is valid`);
    }
  });

  it('coerces then validates a raw enum value', () => {
    const { schema } = SETTINGS_SCHEMA.MAESTRO_EXECUTION_MODE;
    assert.doesNotThrow(() => assertValid(schema, coerceScalar(schema, 'parallel'), 'MAESTRO_EXECUTION_MODE'));
    assert.throws(() => assertValid(schema, coerceScalar(schema, 'bogus'), 'MAESTRO_EXECUTION_MODE'));
  });
});
