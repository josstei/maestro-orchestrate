import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { attempt } from '../../dist/src/mcp/handlers/attempt.js';

describe('attempt', () => {
  it('returns the computation result on success', () => {
    assert.equal(attempt(() => 42), 42);
  });

  it('returns the fallback on any throw', () => {
    assert.equal(attempt(() => { throw new Error('boom'); }, 'fallback'), 'fallback');
  });

  it('defaults the fallback to undefined (pure swallow)', () => {
    assert.equal(attempt(() => { throw new Error('boom'); }), undefined);
  });

  it('passes falsy successful results through, never the fallback', () => {
    assert.equal(attempt(() => 0, 'x'), 0);
    assert.equal(attempt(() => false, true), false);
    assert.equal(attempt(() => '', 'y'), '');
    assert.equal(attempt(() => null, 'z'), null);
  });
});
