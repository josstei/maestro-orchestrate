import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlanValidationContext } from '../../dist/src/mcp/validation/plan-validation-context.js';
import { computeDepths } from '../../dist/src/mcp/validation/dag-checker.js';

function phase(id, blocked_by = []) {
  return { id, name: `Phase ${id}`, agent: 'architect', parallel: false, blocked_by };
}

describe('PlanValidationContext', () => {
  it('exposes the raw plan and task complexity', () => {
    const plan = { phases: [phase('p1')] };
    const context = new PlanValidationContext(plan, 'medium');
    assert.equal(context.plan, plan);
    assert.equal(context.taskComplexity, 'medium');
  });

  it('returns the phase list, and [] for a malformed plan', () => {
    const phases = [phase('p1'), phase('p2')];
    assert.deepEqual(new PlanValidationContext({ phases }, 'simple').phases, phases);
    assert.deepEqual(new PlanValidationContext(null, 'simple').phases, []);
    assert.deepEqual(new PlanValidationContext({ phases: 'x' }, 'simple').phases, []);
  });

  it('indexes phases by id', () => {
    const p1 = phase('p1');
    const p2 = phase('p2');
    const context = new PlanValidationContext({ phases: [p1, p2] }, 'simple');
    assert.equal(context.phaseById.get('p1'), p1);
    assert.equal(context.phaseById.get('p2'), p2);
  });

  it('memoizes phaseById (same reference on repeated access)', () => {
    const context = new PlanValidationContext({ phases: [phase('p1')] }, 'simple');
    assert.equal(context.phaseById, context.phaseById);
  });

  it('derives depths matching computeDepths and memoizes them', () => {
    const phases = [phase('p1'), phase('p2', ['p1']), phase('p3', ['p2'])];
    const context = new PlanValidationContext({ phases }, 'complex');
    const expected = computeDepths(phases, new Map(phases.map((p) => [p.id, p])));
    assert.deepEqual(context.depths, expected);
    assert.equal(context.depths, context.depths);
  });
});
