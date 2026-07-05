import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runPlanValidation } from '../../src/mcp/validation/plan-validation-pipeline.js';
import { PLAN_VALIDATION_STAGES } from '../../src/mcp/validation/rule-registry.js';
import { handleValidatePlan } from '../../src/mcp/handlers/validate-plan.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);

const handlerSource = fs.readFileSync(
  path.join(moduleDirname, '../../src/mcp/handlers/validate-plan.js'),
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
