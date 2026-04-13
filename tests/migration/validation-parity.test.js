'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validateSessionId } = require('../../src/state/session-id-validator');
const { assertSessionId, assertNonEmptyArray } = require('../../src/lib/validation');
const { ValidationError } = require('../../src/lib/errors');

const VALID_SESSION_IDS = [
  'abc-123',
  'test_session',
  'simple',
  'UPPERCASE',
  'MiXeD-CaSe_123',
  'a',
  '0',
  '---',
  '___',
  'session-2024-01-15',
];

const INVALID_SESSION_IDS = [
  '',
  'abc def',
  'abc/def',
  null,
  123,
  undefined,
  'path\\backslash',
  'tab\there',
  'new\nline',
  {},
  [],
  true,
];

describe('validation-parity: assertSessionId() vs validateSessionId()', () => {
  for (const id of VALID_SESSION_IDS) {
    it(`accepts valid ID: ${JSON.stringify(id)}`, () => {
      assert.strictEqual(validateSessionId(id), true);
      assert.doesNotThrow(() => assertSessionId(id));
    });
  }

  for (const id of INVALID_SESSION_IDS) {
    it(`rejects invalid ID: ${JSON.stringify(id)}`, () => {
      assert.strictEqual(validateSessionId(id), false);
      assert.throws(() => assertSessionId(id), ValidationError);
    });
  }
});

const NON_ARRAY_INPUTS = [
  { value: null, label: 'null' },
  { value: undefined, label: 'undefined' },
  { value: '', label: 'empty string' },
  { value: 0, label: 'zero' },
  { value: {}, label: 'plain object' },
  { value: [], label: 'empty array' },
];

describe('validation-parity: assertNonEmptyArray()', () => {
  for (const { value, label } of NON_ARRAY_INPUTS) {
    it(`rejects ${label}`, () => {
      assert.throws(
        () => assertNonEmptyArray(value, 'testField'),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.ok(err.message.includes('testField'));
          assert.ok(err.message.includes('non-empty array'));
          return true;
        }
      );
    });
  }

  it('accepts a non-empty array', () => {
    assert.doesNotThrow(() => assertNonEmptyArray(['item'], 'testField'));
  });

  it('accepts a multi-element array', () => {
    assert.doesNotThrow(() => assertNonEmptyArray([1, 2, 3], 'testField'));
  });

  it('accepts an array with mixed types', () => {
    assert.doesNotThrow(() => assertNonEmptyArray([null, '', 0], 'testField'));
  });
});
