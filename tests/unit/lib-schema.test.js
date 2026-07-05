import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  string,
  integer,
  boolean,
  enumOf,
  arrayOf,
  csv,
  recordOf,
  shape,
  validate,
  assertValid,
  coerceScalar,
} from '../../src/lib/schema/index.js';

describe('validate — scalars', () => {
  it('accepts a valid string', () => {
    assert.deepEqual(validate(string(), 'hello', 'x'), []);
  });

  it('rejects a non-string', () => {
    assert.deepEqual(validate(string(), 5, 'x'), ['x: expected string, got 5']);
  });

  it('accepts a valid integer and enforces min', () => {
    assert.deepEqual(validate(integer({ min: 0 }), 3, 'x'), []);
    assert.deepEqual(validate(integer({ min: 0 }), -1, 'x'), [
      'x: expected integer >= 0, got -1',
    ]);
  });

  it('rejects a non-integer number', () => {
    assert.deepEqual(validate(integer(), 1.5, 'x'), [
      'x: expected integer, got 1.5',
    ]);
  });

  it('validates booleans and enums', () => {
    assert.deepEqual(validate(boolean(), true, 'x'), []);
    assert.deepEqual(validate(boolean(), 'true', 'x'), [
      'x: expected boolean, got "true"',
    ]);
    assert.deepEqual(validate(enumOf(['a', 'b']), 'a', 'x'), []);
    assert.deepEqual(validate(enumOf(['a', 'b']), 'c', 'x'), [
      'x: expected one of [a, b], got "c"',
    ]);
  });
});

describe('validate — composites', () => {
  it('validates array items with indexed labels', () => {
    assert.deepEqual(validate(arrayOf(string()), ['a', 2], 'tools'), [
      'tools[1]: expected string, got 2',
    ]);
  });

  it('validates record values with keyed labels', () => {
    assert.deepEqual(validate(recordOf(string()), { a: 'x', b: 3 }, 'r'), [
      'r.b: expected string, got 3',
    ]);
  });

  it('flags a missing required shape field but allows optional and extra keys', () => {
    const s = shape({ name: string(), focus: string() }, { optional: ['focus'] });
    assert.deepEqual(validate(s, { name: 'a', extra: 1 }, 'e'), []);
    assert.deepEqual(validate(s, { focus: 'f' }, 'e'), [
      'e.name: missing required field',
    ]);
  });
});

describe('assertValid', () => {
  it('throws ValidationError with a joined message', () => {
    assert.throws(
      () => assertValid(enumOf(['x']), 'y', 'mode'),
      (err) => {
        assert.equal(err.name, 'ValidationError');
        assert.match(err.message, /Schema validation failed for mode/);
        assert.deepEqual(err.details.errors, [
          'mode: expected one of [x], got "y"',
        ]);
        return true;
      }
    );
  });

  it('does not throw on valid input', () => {
    assert.doesNotThrow(() => assertValid(string(), 'ok', 'x'));
  });
});

describe('coerceScalar', () => {
  it('coerces integers, booleans, and csv from raw strings', () => {
    assert.equal(coerceScalar(integer(), '3'), 3);
    assert.equal(coerceScalar(boolean(), 'TRUE'), true);
    assert.equal(coerceScalar(boolean(), 'false'), false);
    assert.deepEqual(coerceScalar(csv(), 'a, b ,,c'), ['a', 'b', 'c']);
  });

  it('returns the raw value unchanged when un-coercible so assertValid can report it', () => {
    assert.equal(coerceScalar(integer(), 'abc'), 'abc');
    assert.deepEqual(validate(integer(), coerceScalar(integer(), 'abc'), 'n'), [
      'n: expected integer, got "abc"',
    ]);
  });
});
