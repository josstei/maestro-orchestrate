'use strict';

const { PHASE_LIMITS, validatePhases } = require('../contracts/plan-schema');
const { violation } = require('./violation');

/**
 * Check the plan shape before validating phase fields, preserving the shared
 * phase contract's violation order in the validate_plan response format.
 */
function checkPlanStructure(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.phases)) {
    return [violation('invalid_plan', 'plan must be an object with a phases array')];
  }
  return validatePhases(plan.phases).violations.map(({ rule, phase_id, field }) => ({
    ...violation(rule, `Phase ${phase_id ?? '?'} field "${field}" ${rule.replace('_', ' ')}`),
    phase_id,
    field,
  }));
}

/**
 * Report the phase budget, duplicate IDs, and dangling dependencies in that
 * order. The caller supplies the same ID index used by the later DAG checks.
 */
function checkPlanConstraints(phases, taskComplexity, phaseById) {
  const violations = [];
  const limit = PHASE_LIMITS[taskComplexity] || Infinity;
  if (phases.length > limit) {
    violations.push(
      violation('phase_count', `${taskComplexity} tasks allow max ${limit} phases, got ${phases.length}`),
    );
  }

  const seenIds = new Set();
  for (const phase of phases) {
    if (seenIds.has(phase.id)) {
      violations.push(violation('duplicate_id', `Duplicate phase ID: ${phase.id}`));
    }
    seenIds.add(phase.id);
  }

  for (const phase of phases) {
    for (const dependencyId of phase.blocked_by || []) {
      if (!phaseById.has(dependencyId)) {
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

module.exports = {
  checkPlanStructure,
  checkPlanConstraints,
};
