'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { assertSessionId, isValidSessionId } = require('../../src/lib/validation');

const { ValidationError } = require('../../src/lib/errors');

function assertThrowsValidation(fn, messagePattern) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ValidationError, `expected ValidationError, got ${err.constructor.name}`);
    assert.equal(err.code, 'VALIDATION_ERROR');
    if (messagePattern instanceof RegExp) {
      assert.match(err.message, messagePattern);
    } else if (typeof messagePattern === 'string') {
      assert.equal(err.message, messagePattern);
    }
    return true;
  });
}

describe('assertSessionId', () => {
  const VALID_IDS = [
    'session-1',
    'my_session',
    'ABC123',
    'a',
    'a-b_c-D-E',
    '0',
    'plan-2024-impl',
  ];

  for (const id of VALID_IDS) {
    it(`accepts valid ID: "${id}"`, () => {
      assert.equal(assertSessionId(id), undefined);
    });
  }

  it('throws for empty string', () => {
    assertThrowsValidation(
      () => assertSessionId(''),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for string with spaces', () => {
    assertThrowsValidation(
      () => assertSessionId('has space'),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for string with dots', () => {
    assertThrowsValidation(
      () => assertSessionId('has.dot'),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for string with slashes', () => {
    assertThrowsValidation(
      () => assertSessionId('path/traversal'),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for null', () => {
    assertThrowsValidation(
      () => assertSessionId(null),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for undefined', () => {
    assertThrowsValidation(
      () => assertSessionId(undefined),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for a number', () => {
    assertThrowsValidation(
      () => assertSessionId(42),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for an object', () => {
    assertThrowsValidation(
      () => assertSessionId({}),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('includes the invalid value in error details', () => {
    try {
      assertSessionId('bad!id');
      assert.fail('should have thrown');
    } catch (err) {
      assert.deepEqual(err.details, { value: 'bad!id' });
    }
  });

  it('throws a ValidationError instance', () => {
    assert.throws(() => assertSessionId('!!!'), (err) => {
      assert.ok(err instanceof ValidationError);
      assert.ok(err instanceof Error);
      assert.equal(err.code, 'VALIDATION_ERROR');
      assert.equal(err.name, 'ValidationError');
      return true;
    });
  });
});

describe('isValidSessionId', () => {
  it('agrees with assertSessionId on valid and invalid input', () => {
    for (const id of ['session-1', 'a-b_c-D-E', '0', '', 'has space', 'path/traversal', null, undefined, 42, {}]) {
      let asserted = true;
      try { assertSessionId(id); } catch { asserted = false; }
      assert.equal(isValidSessionId(id), asserted, `mismatch for ${String(id)}`);
    }
  });
});
