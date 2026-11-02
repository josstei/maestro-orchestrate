'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { assertSessionId, isValidSessionId } = require('../../src/lib/validation');
const { ValidationError } = require('../../src/lib/errors');

const VALID_IDS = ['session-1', 'my_session', 'ABC123', 'a', 'a-b_c-D-E', '0', 'plan-2024-impl'];
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

describe('assertSessionId', () => {
  for (const id of VALID_IDS) {
    it(`accepts valid ID: "${id}"`, () => {
      assert.equal(assertSessionId(id), undefined);
    });
  }

  for (const [label, id] of INVALID_IDS) {
    it(`throws for ${label}`, () => {
      assert.throws(() => assertSessionId(id), {
        constructor: ValidationError,
        code: 'VALIDATION_ERROR',
        message: 'Invalid session_id: must match pattern [a-zA-Z0-9_-]+',
      });
    });
  }

  it('includes the invalid value in error details', () => {
    assert.throws(() => assertSessionId('bad!id'), { details: { value: 'bad!id' } });
  });
});

describe('isValidSessionId', () => {
  it('returns true exactly for the IDs assertSessionId accepts', () => {
    for (const id of VALID_IDS) assert.equal(isValidSessionId(id), true, id);
    for (const [label, id] of INVALID_IDS) assert.equal(isValidSessionId(id), false, label);
  });
});
