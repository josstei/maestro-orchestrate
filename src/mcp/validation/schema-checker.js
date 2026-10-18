'use strict';

const { validatePhases } = require('../contracts/plan-schema');
const { violation } = require('./violation');

const PHASE_LIMITS = {
  simple: 3,
  medium: 5,
  complex: Infinity,
};

/**
 * Lightweight shape validation: guard against non-object plans or
 * missing `phases` arrays so downstream checkers can assume a phase list.
 * Returns a single `invalid_plan` violation when the structure is wrong.
 */
function checkPlanShape(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.phases)) {
    return [violation('invalid_plan', 'plan must be an object with a phases array')];
  }
  return [];
}

/**
 * Enforce task-complexity phase budgets: simple<=3, medium<=5, complex unlimited.
 */
function checkPhaseCount(phases, taskComplexity) {
  const limit = PHASE_LIMITS[taskComplexity] || Infinity;
  if (phases.length > limit) {
    return [
      violation('phase_count', `${taskComplexity} tasks allow max ${limit} phases, got ${phases.length}`),
    ];
  }
  return [];
}

/**
 * Flag duplicate phase IDs. Emits one violation per duplicate occurrence
 * (matches the original loop behavior).
 */
function checkDuplicateIds(phases) {
  const violations = [];
  const seenIds = new Set();
  for (const phase of phases) {
    if (seenIds.has(phase.id)) {
      violations.push(violation('duplicate_id', `Duplicate phase ID: ${phase.id}`));
    }
    seenIds.add(phase.id);
  }
  return violations;
}

/**
 * Flag blocked_by entries that reference non-existent phase IDs.
 */
function checkDanglingDependencies(phases) {
  const violations = [];
  const allIds = new Set(phases.map((phase) => phase.id));
  for (const phase of phases) {
    for (const dependencyId of phase.blocked_by || []) {
      if (!allIds.has(dependencyId)) {
        violations.push(
          violation(
            'dangling_dependency',
            `Phase ${phase.id} references non-existent dependency: ${dependencyId}`
          )
        );
      }
    }
  }
  return violations;
}

/**
 * Delegate per-phase field validation to the shared `validatePhases` contract.
 * Maps contract violations to the schema-checker violation shape.
 */
function checkPhaseFieldSchema(phases) {
  const result = validatePhases(phases);
  if (result.valid) return [];
  return result.violations.map((contractViolation) => ({
    rule: contractViolation.rule,
    detail: `Phase ${contractViolation.phase_id ?? '?'} field "${contractViolation.field}" ${contractViolation.rule.replace('_', ' ')}`,
    severity: 'error',
    phase_id: contractViolation.phase_id,
    field: contractViolation.field,
  }));
}

module.exports = {
  checkPlanShape,
  checkPhaseCount,
  checkDuplicateIds,
  checkDanglingDependencies,
  checkPhaseFieldSchema,
};
