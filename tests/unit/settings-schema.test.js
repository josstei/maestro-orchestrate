import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SETTINGS_SCHEMA,
  SETTING_NAMES,
  EXECUTION_MODES,
  VALIDATION_STRICTNESS_LEVELS,
} from '../../dist/src/config/settings-schema.js';
import { parseOrThrow } from '../../dist/src/core/zod-validation.js';

describe('settings-schema', () => {
  it('declares the ten MAESTRO_* settings', () => {
    assert.deepEqual([...SETTING_NAMES].sort(), [
      'MAESTRO_ARCHIVE_RETENTION',
      'MAESTRO_AUTO_ARCHIVE',
      'MAESTRO_DISABLED_AGENTS',
      'MAESTRO_EXECUTION_MODE',
      'MAESTRO_KNOWLEDGE_DIR',
      'MAESTRO_MAX_CONCURRENT',
      'MAESTRO_MAX_RETRIES',
      'MAESTRO_MEMORY_INJECTION',
      'MAESTRO_STATE_DIR',
      'MAESTRO_VALIDATION_STRICTNESS',
    ]);
  });

  it('gives every setting a Zod schema, default, and presentation descriptor', () => {
    for (const name of SETTING_NAMES) {
      const spec = SETTINGS_SCHEMA[name];
      assert.equal(typeof spec.schema.safeParse, 'function', `${name} has a Zod schema`);
      assert.ok('default' in spec, `${name} declares a default`);
      assert.deepEqual(Object.keys(spec.presentation).sort(), [
        'description',
        'documented',
        'extensionVisible',
        'label',
        'usage',
        'valueHint',
      ]);
    }
  });

  it('grounds the enum members and key defaults', () => {
    assert.deepEqual(EXECUTION_MODES, ['ask', 'parallel', 'sequential']);
    assert.deepEqual(VALIDATION_STRICTNESS_LEVELS, ['strict', 'normal', 'lenient']);
    assert.equal(SETTINGS_SCHEMA.MAESTRO_STATE_DIR.default, 'docs/maestro');
    assert.equal(SETTINGS_SCHEMA.MAESTRO_EXECUTION_MODE.default, 'ask');
    assert.equal(SETTINGS_SCHEMA.MAESTRO_VALIDATION_STRICTNESS.default, 'normal');
    assert.equal(SETTINGS_SCHEMA.MAESTRO_KNOWLEDGE_DIR.default, '~/.maestro/knowledge');
    assert.equal(SETTINGS_SCHEMA.MAESTRO_MAX_CONCURRENT.default, 0);
    assert.equal(SETTINGS_SCHEMA.MAESTRO_MAX_RETRIES.default, 2);
    assert.equal(SETTINGS_SCHEMA.MAESTRO_ARCHIVE_RETENTION.default, 0);
    assert.equal(SETTINGS_SCHEMA.MAESTRO_AUTO_ARCHIVE.default, false);
    assert.deepEqual(SETTINGS_SCHEMA.MAESTRO_DISABLED_AGENTS.default, []);
    assert.equal(SETTINGS_SCHEMA.MAESTRO_MEMORY_INJECTION.default, true);
  });

  it('each default satisfies its own schema', () => {
    for (const name of SETTING_NAMES) {
      const { schema, default: value } = SETTINGS_SCHEMA[name];
      assert.deepEqual(parseOrThrow(schema, value, name), value, `${name} default is valid`);
    }
  });

  it('coerces raw setting values through their Zod codecs', () => {
    assert.equal(SETTINGS_SCHEMA.MAESTRO_MAX_RETRIES.schema.parse('3'), 3);
    assert.equal(SETTINGS_SCHEMA.MAESTRO_AUTO_ARCHIVE.schema.parse('TRUE'), true);
    assert.deepEqual(
      SETTINGS_SCHEMA.MAESTRO_DISABLED_AGENTS.schema.parse('architect, tester ,,coder'),
      ['architect', 'tester', 'coder'],
    );

    const { schema } = SETTINGS_SCHEMA.MAESTRO_EXECUTION_MODE;
    assert.equal(schema.parse('parallel'), 'parallel');
    assert.throws(() => parseOrThrow(schema, 'bogus', 'MAESTRO_EXECUTION_MODE'));
  });

  it('exposes exactly the current seven extension-visible documented settings', () => {
    const visible = SETTING_NAMES.filter(
      (name) => SETTINGS_SCHEMA[name].presentation.extensionVisible,
    );
    const documented = SETTING_NAMES.filter(
      (name) => SETTINGS_SCHEMA[name].presentation.documented,
    );
    const expected = [
      'MAESTRO_DISABLED_AGENTS',
      'MAESTRO_MAX_RETRIES',
      'MAESTRO_AUTO_ARCHIVE',
      'MAESTRO_VALIDATION_STRICTNESS',
      'MAESTRO_STATE_DIR',
      'MAESTRO_MAX_CONCURRENT',
      'MAESTRO_EXECUTION_MODE',
    ];
    assert.deepEqual(visible, expected);
    assert.deepEqual(documented, expected);

    for (const hidden of [
      'MAESTRO_ARCHIVE_RETENTION',
      'MAESTRO_KNOWLEDGE_DIR',
      'MAESTRO_MEMORY_INJECTION',
    ]) {
      assert.equal(SETTINGS_SCHEMA[hidden].presentation.extensionVisible, false);
      assert.equal(SETTINGS_SCHEMA[hidden].presentation.documented, false);
    }
  });

  it('preserves the ValidationError envelope and stable ordered issue strings', () => {
    assert.throws(
      () => parseOrThrow(
        SETTINGS_SCHEMA.MAESTRO_MAX_RETRIES.schema,
        '-1',
        'MAESTRO_MAX_RETRIES',
      ),
      (err) => {
        assert.equal(err.name, 'ValidationError');
        assert.equal(
          err.message,
          'Schema validation failed for MAESTRO_MAX_RETRIES:\n  - MAESTRO_MAX_RETRIES: expected integer >= 0, got -1',
        );
        assert.deepEqual(err.details, {
          label: 'MAESTRO_MAX_RETRIES',
          errors: ['MAESTRO_MAX_RETRIES: expected integer >= 0, got -1'],
        });
        return true;
      },
    );

    assert.throws(
      () => parseOrThrow(
        SETTINGS_SCHEMA.MAESTRO_MAX_RETRIES.schema,
        '-1.5',
        'MAESTRO_MAX_RETRIES',
      ),
      (err) => {
        assert.deepEqual(err.details.errors, [
          'MAESTRO_MAX_RETRIES: expected integer, got -1.5',
        ]);
        return true;
      },
    );

    assert.throws(
      () => parseOrThrow(
        SETTINGS_SCHEMA.MAESTRO_MAX_RETRIES.schema,
        'abc',
        'MAESTRO_MAX_RETRIES',
      ),
      (err) => {
        assert.deepEqual(err.details.errors, [
          'MAESTRO_MAX_RETRIES: expected integer, got "abc"',
        ]);
        return true;
      },
    );
  });
});
