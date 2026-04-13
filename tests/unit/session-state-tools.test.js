'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { coerceNumber } = require('../../src/mcp/handlers/session-state-tools');

describe('coerceNumber', () => {
  it('passes through null', () => {
    assert.strictEqual(coerceNumber(null), null);
  });

  it('passes through undefined', () => {
    assert.strictEqual(coerceNumber(undefined), undefined);
  });

  it('passes through existing numbers', () => {
    assert.strictEqual(coerceNumber(0), 0);
    assert.strictEqual(coerceNumber(42), 42);
    assert.strictEqual(coerceNumber(-5), -5);
  });

  it('coerces valid string numbers to integers', () => {
    assert.strictEqual(coerceNumber('1'), 1);
    assert.strictEqual(coerceNumber('42'), 42);
    assert.strictEqual(coerceNumber('999'), 999);
  });

  it('coerces positive string IDs used by phase lookups', () => {
    assert.strictEqual(coerceNumber('2'), 2);
  });

  it('rejects empty strings', () => {
    assert.strictEqual(coerceNumber(''), '');
  });

  it('rejects whitespace-only strings', () => {
    assert.strictEqual(coerceNumber(' '), ' ');
    assert.strictEqual(coerceNumber('  '), '  ');
  });

  it('rejects non-numeric strings', () => {
    assert.strictEqual(coerceNumber('foo'), 'foo');
    assert.strictEqual(coerceNumber('abc123'), 'abc123');
  });

  it('rejects float strings (non-integers)', () => {
    assert.strictEqual(coerceNumber('2.5'), '2.5');
  });

  it('rejects zero and negative string numbers', () => {
    assert.strictEqual(coerceNumber('0'), '0');
    assert.strictEqual(coerceNumber('-1'), '-1');
  });

  it('passes through non-string, non-number types', () => {
    assert.strictEqual(coerceNumber(true), true);
    assert.strictEqual(coerceNumber(false), false);
    assert.deepStrictEqual(coerceNumber({}), {});
    assert.deepStrictEqual(coerceNumber([]), []);
  });

  it('works with array.map for bulk coercion', () => {
    const input = ['1', '2', '3', 'foo', ''];
    const result = input.map(coerceNumber);
    assert.deepStrictEqual(result, [1, 2, 3, 'foo', '']);
  });

  it('is idempotent', () => {
    assert.strictEqual(coerceNumber(coerceNumber('42')), 42);
    assert.strictEqual(coerceNumber(coerceNumber('foo')), 'foo');
    assert.strictEqual(coerceNumber(coerceNumber(42)), 42);
  });
});
