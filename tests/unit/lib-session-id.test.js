'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { assertSessionId, isValidSessionId } = require('../../src/lib/session-id');

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

  const INVALID_IDS = [
    ['empty string', ''],
    ['string with spaces', 'has space'],
    ['string with dots', 'has.dot'],
    ['string with slashes', 'path/traversal'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an object', {}],
  ];

  for (const [label, id] of INVALID_IDS) {
    it(`throws for ${label}`, () => {
      assertThrowsValidation(
        () => assertSessionId(id),
        'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
      );
    });
  }

  it('includes the invalid value in error details', () => {
    try {
      assertSessionId('bad!id');
      assert.fail('should have thrown');
    } catch (err) {
      assert.deepEqual(err.details, { value: 'bad!id' });
    }
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
