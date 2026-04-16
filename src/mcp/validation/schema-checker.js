'use strict';

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
    return [
      {
        rule: 'invalid_plan',
        detail: 'plan must be an object with a phases array',
        severity: 'error',
      },
    ];
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
      {
        rule: 'phase_count',
        detail: `${taskComplexity} tasks allow max ${limit} phases, got ${phases.length}`,
        severity: 'error',
      },
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
      violations.push({
        rule: 'duplicate_id',
        detail: `Duplicate phase ID: ${phase.id}`,
        severity: 'error',
      });
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
        violations.push({
          rule: 'dangling_dependency',
          detail: `Phase ${phase.id} references non-existent dependency: ${dependencyId}`,
          severity: 'error',
        });
      }
    }
  }
  return violations;
}

module.exports = {
  PHASE_LIMITS,
  checkPlanShape,
  checkPhaseCount,
  checkDuplicateIds,
  checkDanglingDependencies,
};
