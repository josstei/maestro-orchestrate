'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { StateError } = require('../../src/lib/errors');
const {
  assertActiveSessionMatches,
  extractFileManifest,
} = require('../../src/mcp/handlers/session-state-core');

describe('assertActiveSessionMatches', () => {
  it('does not throw when the session_id matches', () => {
    assert.doesNotThrow(() => {
      assertActiveSessionMatches({ session_id: 'test-session' }, 'test-session');
    });
  });

  it('throws a StateError with the exact mismatch message when session_id differs', () => {
    assert.throws(
      () => {
        assertActiveSessionMatches({ session_id: 'active-one' }, 'requested-two');
      },
      (err) => {
        assert.ok(err instanceof StateError);
        assert.equal(
          err.message,
          "Session mismatch: active session is 'active-one', got 'requested-two'"
        );
        return true;
      }
    );
  });
});

describe('extractFileManifest', () => {
  it('defaults missing file arrays to empty arrays', () => {
    const result = extractFileManifest({});
    assert.deepEqual(result.filesCreated, []);
    assert.deepEqual(result.filesModified, []);
    assert.deepEqual(result.filesDeleted, []);
    assert.equal(result.hasFiles, false);
  });

  it('preserves provided arrays verbatim', () => {
    const result = extractFileManifest({
      files_created: ['a.js'],
      files_modified: ['b.js'],
      files_deleted: ['c.js'],
    });
    assert.deepEqual(result.filesCreated, ['a.js']);
    assert.deepEqual(result.filesModified, ['b.js']);
    assert.deepEqual(result.filesDeleted, ['c.js']);
  });

  it('sets hasFiles true when any of the three arrays is non-empty', () => {
    assert.equal(extractFileManifest({ files_created: ['a.js'] }).hasFiles, true);
    assert.equal(extractFileManifest({ files_modified: ['b.js'] }).hasFiles, true);
    assert.equal(extractFileManifest({ files_deleted: ['c.js'] }).hasFiles, true);
  });

  it('sets hasFiles false when all three arrays are empty or absent', () => {
    assert.equal(
      extractFileManifest({
        files_created: [],
        files_modified: [],
        files_deleted: [],
      }).hasFiles,
      false
    );
    assert.equal(extractFileManifest({}).hasFiles, false);
  });

  it('coerces non-array truthy values to an empty array', () => {
    const result = extractFileManifest({
      files_created: 'not-an-array',
      files_modified: { not: 'an array' },
      files_deleted: 42,
    });
    assert.deepEqual(result.filesCreated, []);
    assert.deepEqual(result.filesModified, []);
    assert.deepEqual(result.filesDeleted, []);
    assert.equal(result.hasFiles, false);
  });
});
