'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { coercePositiveInteger } = require('../../src/lib/validation');

describe('coercePositiveInteger', () => {
  it('passes through null', () => {
    assert.strictEqual(coercePositiveInteger(null), null);
  });

  it('passes through undefined', () => {
    assert.strictEqual(coercePositiveInteger(undefined), undefined);
  });

  it('passes through existing numbers', () => {
    assert.strictEqual(coercePositiveInteger(0), 0);
    assert.strictEqual(coercePositiveInteger(42), 42);
    assert.strictEqual(coercePositiveInteger(-5), -5);
  });

  it('coerces valid string numbers to integers', () => {
    assert.strictEqual(coercePositiveInteger('1'), 1);
    assert.strictEqual(coercePositiveInteger('42'), 42);
    assert.strictEqual(coercePositiveInteger('999'), 999);
  });

  it('coerces positive string IDs used by phase lookups', () => {
    assert.strictEqual(coercePositiveInteger('2'), 2);
  });

  it('rejects empty strings', () => {
    assert.strictEqual(coercePositiveInteger(''), '');
  });

  it('rejects whitespace-only strings', () => {
    assert.strictEqual(coercePositiveInteger(' '), ' ');
    assert.strictEqual(coercePositiveInteger('  '), '  ');
  });

  it('rejects non-numeric strings', () => {
    assert.strictEqual(coercePositiveInteger('foo'), 'foo');
    assert.strictEqual(coercePositiveInteger('abc123'), 'abc123');
  });

  it('rejects float strings (non-integers)', () => {
    assert.strictEqual(coercePositiveInteger('2.5'), '2.5');
  });

  it('rejects zero and negative string numbers', () => {
    assert.strictEqual(coercePositiveInteger('0'), '0');
    assert.strictEqual(coercePositiveInteger('-1'), '-1');
  });

  it('passes through non-string, non-number types', () => {
    assert.strictEqual(coercePositiveInteger(true), true);
    assert.strictEqual(coercePositiveInteger(false), false);
    assert.deepStrictEqual(coercePositiveInteger({}), {});
    assert.deepStrictEqual(coercePositiveInteger([]), []);
  });

  it('works with array.map for bulk coercion', () => {
    const input = ['1', '2', '3', 'foo', ''];
    const result = input.map(coercePositiveInteger);
    assert.deepStrictEqual(result, [1, 2, 3, 'foo', '']);
  });

  it('is idempotent', () => {
    assert.strictEqual(coercePositiveInteger(coercePositiveInteger('42')), 42);
    assert.strictEqual(coercePositiveInteger(coercePositiveInteger('foo')), 'foo');
    assert.strictEqual(coercePositiveInteger(coercePositiveInteger(42)), 42);
  });
});
