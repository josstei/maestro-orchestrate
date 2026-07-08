import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTypedSetting } from '../../dist/src/config/setting-resolver.js';

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

describe('resolveTypedSetting', () => {
  it('returns the declared default when unset', () => {
    const result = withEnv(
      { MAESTRO_MAX_RETRIES: null, MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_MAX_RETRIES', undefined)
    );
    assert.equal(result, 2);
  });

  it('coerces and validates a set integer', () => {
    const result = withEnv(
      { MAESTRO_MAX_CONCURRENT: '4', MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_MAX_CONCURRENT', undefined)
    );
    assert.equal(result, 4);
  });

  it('returns the archive-retention default (0) when unset', () => {
    const result = withEnv(
      { MAESTRO_ARCHIVE_RETENTION: null, MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_ARCHIVE_RETENTION', undefined)
    );
    assert.equal(result, 0);
  });

  it('splits a csv setting into a trimmed array', () => {
    const result = withEnv(
      { MAESTRO_DISABLED_AGENTS: 'architect, tester', MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_DISABLED_AGENTS', undefined)
    );
    assert.deepEqual(result, ['architect', 'tester']);
  });

  it('returns the memory-injection default (true) when unset', () => {
    const result = withEnv(
      { MAESTRO_MEMORY_INJECTION: null, MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_MEMORY_INJECTION', undefined)
    );
    assert.equal(result, true);
  });

  it('coerces an explicit memory-injection false', () => {
    const result = withEnv(
      { MAESTRO_MEMORY_INJECTION: 'false', MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_MEMORY_INJECTION', undefined)
    );
    assert.equal(result, false);
  });

  it('returns the knowledge-dir default when unset and preserves explicit strings', () => {
    const defaultResult = withEnv(
      { MAESTRO_KNOWLEDGE_DIR: null, MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_KNOWLEDGE_DIR', undefined)
    );
    assert.equal(defaultResult, '~/.maestro/knowledge');

    const explicitResult = withEnv(
      { MAESTRO_KNOWLEDGE_DIR: '/tmp/maestro-knowledge', MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_KNOWLEDGE_DIR', undefined)
    );
    assert.equal(explicitResult, '/tmp/maestro-knowledge');
  });

  it('throws ValidationError on a bad enum value', () => {
    assert.throws(
      () =>
        withEnv(
          { MAESTRO_EXECUTION_MODE: 'parralel', MAESTRO_EXTENSION_PATH: null },
          () => resolveTypedSetting('MAESTRO_EXECUTION_MODE', undefined)
        ),
      (err) => {
        assert.equal(err.name, 'ValidationError');
        return true;
      }
    );
  });

  it('throws ValidationError on a non-integer value', () => {
    assert.throws(
      () =>
        withEnv(
          { MAESTRO_MAX_RETRIES: 'abc', MAESTRO_EXTENSION_PATH: null },
          () => resolveTypedSetting('MAESTRO_MAX_RETRIES', undefined)
        ),
      /ValidationError/
    );
  });

  it('throws ValidationError on an unknown setting name', () => {
    assert.throws(() => resolveTypedSetting('MAESTRO_NOPE', undefined), /Unknown setting/);
  });
});
