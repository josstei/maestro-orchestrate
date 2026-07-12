import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTypedSetting } from '../../dist/src/config/setting-resolver.js';
import { withEnvSync } from '../support/environment.js';

describe('resolveTypedSetting', () => {
  it('returns the declared default when unset', () => {
    const result = withEnvSync(
      { MAESTRO_MAX_RETRIES: null, MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_MAX_RETRIES', undefined)
    );
    assert.equal(result, 2);
  });

  it('returns the auto-archive default (false) when unset', () => {
    const result = withEnvSync(
      { MAESTRO_AUTO_ARCHIVE: null, MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_AUTO_ARCHIVE', undefined)
    );
    assert.equal(result, false);
  });

  it('coerces and validates a set integer', () => {
    const result = withEnvSync(
      { MAESTRO_MAX_CONCURRENT: '4', MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_MAX_CONCURRENT', undefined)
    );
    assert.equal(result, 4);
  });

  it('returns the archive-retention default (0) when unset', () => {
    const result = withEnvSync(
      { MAESTRO_ARCHIVE_RETENTION: null, MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_ARCHIVE_RETENTION', undefined)
    );
    assert.equal(result, 0);
  });

  it('splits a csv setting into a trimmed array', () => {
    const result = withEnvSync(
      { MAESTRO_DISABLED_AGENTS: 'architect, tester', MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_DISABLED_AGENTS', undefined)
    );
    assert.deepEqual(result, ['architect', 'tester']);
  });

  it('returns the memory-injection default (true) when unset', () => {
    const result = withEnvSync(
      { MAESTRO_MEMORY_INJECTION: null, MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_MEMORY_INJECTION', undefined)
    );
    assert.equal(result, true);
  });

  it('coerces an explicit memory-injection false', () => {
    const result = withEnvSync(
      { MAESTRO_MEMORY_INJECTION: 'false', MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_MEMORY_INJECTION', undefined)
    );
    assert.equal(result, false);
  });

  it('returns the knowledge-dir default when unset and preserves explicit strings', () => {
    const defaultResult = withEnvSync(
      { MAESTRO_KNOWLEDGE_DIR: null, MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_KNOWLEDGE_DIR', undefined)
    );
    assert.equal(defaultResult, '~/.maestro/knowledge');

    const explicitResult = withEnvSync(
      { MAESTRO_KNOWLEDGE_DIR: '/tmp/maestro-knowledge', MAESTRO_EXTENSION_PATH: null },
      () => resolveTypedSetting('MAESTRO_KNOWLEDGE_DIR', undefined)
    );
    assert.equal(explicitResult, '/tmp/maestro-knowledge');
  });

  it('throws ValidationError on a bad enum value', () => {
    assert.throws(
      () =>
        withEnvSync(
          { MAESTRO_EXECUTION_MODE: 'parralel', MAESTRO_EXTENSION_PATH: null },
          () => resolveTypedSetting('MAESTRO_EXECUTION_MODE', undefined)
        ),
      (err) => {
        assert.equal(err.name, 'ValidationError');
        assert.deepEqual(err.details, {
          label: 'MAESTRO_EXECUTION_MODE',
          errors: [
            'MAESTRO_EXECUTION_MODE: expected one of [ask, parallel, sequential], got "parralel"',
          ],
        });
        return true;
      }
    );
  });

  it('throws ValidationError on a non-integer value', () => {
    assert.throws(
      () =>
        withEnvSync(
          { MAESTRO_MAX_RETRIES: 'abc', MAESTRO_EXTENSION_PATH: null },
          () => resolveTypedSetting('MAESTRO_MAX_RETRIES', undefined)
        ),
      (err) => {
        assert.equal(err.name, 'ValidationError');
        assert.deepEqual(err.details, {
          label: 'MAESTRO_MAX_RETRIES',
          errors: ['MAESTRO_MAX_RETRIES: expected integer, got "abc"'],
        });
        return true;
      }
    );
  });

  it('throws ValidationError on an unknown setting name', () => {
    assert.throws(() => resolveTypedSetting('MAESTRO_NOPE', undefined), /Unknown setting/);
  });
});
