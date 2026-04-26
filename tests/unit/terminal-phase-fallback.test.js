'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveEffectivePhaseKind,
} = require('../../src/mcp/handlers/session-state-tools');

describe('resolveEffectivePhaseKind', () => {
  it('returns explicit kind when present', () => {
    const phase = { id: 1, kind: 'review' };
    const all = [{ id: 1 }, { id: 2 }];
    assert.equal(resolveEffectivePhaseKind(phase, all), 'review');
  });

  it('returns explicit kind even on terminal phase', () => {
    const phase = { id: 2, kind: 'implementation' };
    const all = [{ id: 1 }, phase];
    assert.equal(resolveEffectivePhaseKind(phase, all), 'implementation');
  });

  it('infers verification for terminal phase without kind', () => {
    const phase = { id: 3 };
    const all = [{ id: 1 }, { id: 2 }, phase];
    assert.equal(resolveEffectivePhaseKind(phase, all), 'verification');
  });

  it('infers implementation for non-terminal phase without kind', () => {
    const phase = { id: 1 };
    const all = [phase, { id: 2 }, { id: 3 }];
    assert.equal(resolveEffectivePhaseKind(phase, all), 'implementation');
  });

  it('treats empty string kind as missing', () => {
    const phase = { id: 1, kind: '' };
    const all = [phase, { id: 2 }];
    assert.equal(resolveEffectivePhaseKind(phase, all), 'implementation');
  });

  it('treats whitespace-only kind as missing', () => {
    const phase = { id: 2, kind: '   ' };
    const all = [{ id: 1 }, phase];
    assert.equal(resolveEffectivePhaseKind(phase, all), 'verification');
  });

  it('handles single-phase session as terminal verification', () => {
    const phase = { id: 1 };
    assert.equal(resolveEffectivePhaseKind(phase, [phase]), 'verification');
  });

  it('handles empty allPhases by defaulting to implementation', () => {
    const phase = { id: 1 };
    assert.equal(resolveEffectivePhaseKind(phase, []), 'implementation');
  });

  it('compares numerically when all ids are integer-coercible (10 > 2)', () => {
    const phase = { id: 10 };
    const all = [{ id: 1 }, { id: 2 }, phase];
    assert.equal(resolveEffectivePhaseKind(phase, all), 'verification');
  });

  it('compares numerically with mixed string-int ids', () => {
    const phase = { id: '10' };
    const all = [{ id: '1' }, { id: '2' }, phase];
    assert.equal(resolveEffectivePhaseKind(phase, all), 'verification');
  });

  it('falls back to lexicographic comparison with non-coercible string ids', () => {
    const phase = { id: 'p3' };
    const all = [{ id: 'p1' }, { id: 'p2' }, phase];
    assert.equal(resolveEffectivePhaseKind(phase, all), 'verification');
  });

  it('handles non-terminal phase in mixed-id session correctly', () => {
    const phase = { id: 1 };
    const all = [phase, { id: 10 }];
    assert.equal(resolveEffectivePhaseKind(phase, all), 'implementation');
  });
});
