'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { runPlanValidation } = require('../../src/mcp/validation/plan-validation-pipeline');
const { PLAN_VALIDATION_STAGES } = require('../../src/mcp/validation/rule-registry');
const { handleValidatePlan } = require('../../src/mcp/handlers/validate-plan');

const handlerSource = fs.readFileSync(
  path.join(__dirname, '../../src/mcp/handlers/validate-plan.js'),
  'utf8'
);

function phase(id, overrides = {}) {
  return { id, name: `Phase ${id}`, agent: 'architect', parallel: false, blocked_by: [], ...overrides };
}

describe('validate_plan handler delegation', () => {
  it('delegates to the pipeline instead of importing the checkers directly', () => {
    assert.match(handlerSource, /runPlanValidation/);
    assert.doesNotMatch(handlerSource, /schema-checker/);
    assert.doesNotMatch(handlerSource, /dag-checker/);
    assert.doesNotMatch(handlerSource, /agent-checker/);
    assert.doesNotMatch(handlerSource, /file-overlap-checker/);
  });

  it('produces the same result the pipeline produces for the default registry', () => {
    const plan = { phases: [phase('p1'), phase('p2', { blocked_by: ['p1'] })] };
    assert.deepEqual(
      handleValidatePlan({ plan, task_complexity: 'medium' }),
      runPlanValidation(plan, 'medium')
    );
  });
});

describe('plan-validation extension seam', () => {
  it('registers a new rule as a data diff without editing the handler', () => {
    const budgetRule = {
      id: 'phase_budget',
      evaluate: (context) =>
        context.phases.length > 2
          ? [{ rule: 'phase_budget', detail: 'too many phases', severity: 'error' }]
          : [],
    };

    const extendedStages = PLAN_VALIDATION_STAGES.map((stage) =>
      stage.id === 'graph' ? { ...stage, rules: [...stage.rules, budgetRule] } : stage
    );

    const plan = { phases: [phase('p1'), phase('p2'), phase('p3')] };

    const baseline = runPlanValidation(plan, 'complex');
    assert.equal(baseline.violations.some((v) => v.rule === 'phase_budget'), false);

    const extended = runPlanValidation(plan, 'complex', extendedStages);
    assert.equal(extended.valid, false);
    assert.equal(extended.violations.some((v) => v.rule === 'phase_budget'), true);
  });
});
