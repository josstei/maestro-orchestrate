'use strict';

const {
  checkPlanStructure,
  checkPlanConstraints,
} = require('../validation/schema-checker');
const {
  checkUnknownAgents,
  checkAgentCapabilities,
} = require('../validation/agent-checker');
const {
  computeDepths,
  checkCycles,
  checkRedundantDependencies,
  checkFileOverlap,
  buildParallelizationProfile,
} = require('../validation/dag-checker');

function handleValidatePlan(params) {
  const { plan, task_complexity: taskComplexity } = params;

  const structureViolations = checkPlanStructure(plan);
  if (structureViolations.length > 0) {
    return {
      valid: false,
      violations: structureViolations,
      parallelization_profile: null,
    };
  }

  const phases = plan.phases;
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));

  const violations = [
    ...checkPlanConstraints(phases, taskComplexity, phaseById),
    ...checkUnknownAgents(phases),
    ...checkAgentCapabilities(phases),
  ];
  const cycleViolations = checkCycles(phases, phaseById);
  violations.push(...cycleViolations);

  let parallelization_profile = null;
  if (cycleViolations.length === 0) {
    const depths = computeDepths(phases, phaseById);
    violations.push(...checkFileOverlap(phases, depths));
    violations.push(...checkRedundantDependencies(phases, phaseById));
    parallelization_profile = buildParallelizationProfile(phases, depths);
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
