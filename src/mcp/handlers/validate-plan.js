'use strict';

const {
  checkPlanShape,
  checkPhaseCount,
  checkDuplicateIds,
  checkDanglingDependencies,
  checkPhaseFieldSchema,
} = require('../validation/schema-checker');
const {
  checkUnknownAgents,
  checkAgentCapabilities,
} = require('../validation/agent-checker');
const {
  computeDepths,
  checkCycles,
  checkRedundantDependencies,
  buildParallelizationProfile,
} = require('../validation/dag-checker');
const { checkFileOverlap } = require('../validation/file-overlap-checker');

function handleValidatePlan(params) {
  const { plan, task_complexity: taskComplexity } = params;

  const shapeViolations = checkPlanShape(plan);
  if (shapeViolations.length > 0) {
    return {
      valid: false,
      violations: shapeViolations,
    };
  }

  const fieldViolations = checkPhaseFieldSchema(plan.phases);
  if (fieldViolations.length > 0) {
    return { valid: false, violations: fieldViolations };
  }

  const phases = plan.phases;
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));

  const violations = [
    ...checkPhaseCount(phases, taskComplexity),
    ...checkDuplicateIds(phases),
    ...checkDanglingDependencies(phases),
    ...checkUnknownAgents(phases),
    ...checkAgentCapabilities(phases),
    ...checkCycles(phases, phaseById),
  ];

  const hasCycleViolation = violations.some(
    (violation) => violation.rule === 'cyclic_dependency'
  );

  let parallelization_profile = null;
  if (!hasCycleViolation) {
    const depths = computeDepths(phases, phaseById);
    violations.push(...checkFileOverlap(phases, depths));
    violations.push(...checkRedundantDependencies(phases, phaseById));
    parallelization_profile = buildParallelizationProfile(phases, phaseById);
  }

  return {
    valid: violations.every((violation) => violation.severity === 'warning'),
    violations,
    parallelization_profile,
  };
}

module.exports = {
  handleValidatePlan,
};
