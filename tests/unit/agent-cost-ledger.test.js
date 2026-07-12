import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAgentBucket,
  normalizeTokenUsage,
  phaseDurationMs,
  attributePhaseCost,
  mergeAgentLedgers,
  summarizeLedger,
} from '../../dist/src/mcp/contracts/agent-cost-ledger.js';

describe('agent-cost-ledger', () => {
  it('createAgentBucket returns a zeroed bucket', () => {
    assert.deepEqual(createAgentBucket(), {
      input: 0, output: 0, cached: 0, phases: 0, duration_ms: 0,
    });
  });

  it('normalizeTokenUsage zeroes missing/negative/non-finite fields', () => {
    assert.deepEqual(normalizeTokenUsage({ input: 5, output: -2, cached: 'x' }), {
      input: 5, output: 0, cached: 0,
    });
    assert.deepEqual(normalizeTokenUsage(null), { input: 0, output: 0, cached: 0 });
  });

  it('phaseDurationMs clamps inverted, equal, and unparseable ranges to 0', () => {
    assert.equal(
      phaseDurationMs('2026-07-02T00:00:00.000Z', '2026-07-02T00:00:01.000Z'),
      1000
    );
    assert.equal(
      phaseDurationMs('2026-07-02T00:00:01.000Z', '2026-07-02T00:00:00.000Z'),
      0
    );
    assert.equal(
      phaseDurationMs('2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z'),
      0
    );
    assert.equal(phaseDurationMs('nope', '2026-07-02T00:00:00.000Z'), 0);
    assert.equal(phaseDurationMs(null, null), 0);
  });

  it('attributePhaseCost sums tokens, increments phases, and adds duration', () => {
    const ledger = {};
    attributePhaseCost(ledger, {
      agent: 'coder',
      tokenUsage: { input: 100, output: 40, cached: 10 },
      durationMs: 250,
    });
    attributePhaseCost(ledger, {
      agent: 'coder',
      tokenUsage: { input: 20, output: 5, cached: 0 },
      durationMs: 50,
    });
    assert.deepEqual(ledger.coder, {
      input: 120, output: 45, cached: 10, phases: 2, duration_ms: 300,
    });
  });

  it('attributePhaseCost falls back to "unassigned" for a missing agent', () => {
    const ledger = {};
    attributePhaseCost(ledger, { agent: undefined, tokenUsage: null, durationMs: 0 });
    assert.equal(ledger.unassigned.phases, 1);
    assert.equal(ledger.unassigned.input, 0);
  });

  it('mergeAgentLedgers adds buckets across sessions', () => {
    const a = {
      coder: { input: 10, output: 2, cached: 1, phases: 1, duration_ms: 100 },
    };
    const b = {
      coder: { input: 5, output: 1, cached: 0, phases: 1, duration_ms: 50 },
      tester: { input: 3, output: 0, cached: 0, phases: 1, duration_ms: 20 },
    };
    const merged = mergeAgentLedgers({}, a);
    mergeAgentLedgers(merged, b);
    assert.deepEqual(merged.coder, {
      input: 15, output: 3, cached: 1, phases: 2, duration_ms: 150,
    });
    assert.deepEqual(merged.tester, {
      input: 3, output: 0, cached: 0, phases: 1, duration_ms: 20,
    });
  });

  it('summarizeLedger totals fields and computes avg_duration_ms', () => {
    const ledger = {
      coder: { input: 15, output: 3, cached: 1, phases: 2, duration_ms: 150 },
      tester: { input: 3, output: 0, cached: 0, phases: 1, duration_ms: 20 },
    };
    const summary = summarizeLedger(ledger);
    assert.deepEqual(summary.totals, {
      input: 18, output: 3, cached: 1, phases: 3, duration_ms: 170,
    });
    assert.equal(summary.by_agent.coder.avg_duration_ms, 75);
    assert.equal(summary.by_agent.tester.avg_duration_ms, 20);
  });
});
