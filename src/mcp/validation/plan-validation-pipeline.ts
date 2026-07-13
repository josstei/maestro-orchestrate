import {
  checkPlanShape,
  checkPhaseCount,
  checkDuplicateIds,
  checkDanglingDependencies,
  checkPhaseFieldSchema,
} from './schema-checker.js';
import { checkUnknownAgents, checkAgentCapabilities } from './agent-checker.js';
import {
  buildParallelizationProfile,
  checkCycles,
  checkRedundantDependencies,
  computeDepths,
} from './dag-checker.js';
import { checkFileOverlap } from './file-overlap-checker.js';

/**
 * Validate a plan with the canonical checker order. Structural and phase-schema
 * errors stop validation before graph checkers; cyclic graphs skip depth-based
 * checks and cannot produce a parallelization profile.
 */
function runPlanValidation(
  plan: unknown,
  taskComplexity: 'simple' | 'medium' | 'complex'
): {
  valid: boolean;
  violations: Array<Record<string, unknown>>;
  parallelization_profile: Record<string, unknown> | null;
} {
  const planShapeViolations = checkPlanShape(plan);
  if (planShapeViolations.some((violation: any) => violation.severity === 'error')) {
    return { valid: false, violations: planShapeViolations, parallelization_profile: null };
  }

  const phases = (plan as { phases: any[] }).phases;
  const phaseSchemaViolations = checkPhaseFieldSchema(phases);
  if (phaseSchemaViolations.some((violation: any) => violation.severity === 'error')) {
    return { valid: false, violations: phaseSchemaViolations, parallelization_profile: null };
  }

  const phaseById = new Map(phases.map((phase: any) => [phase.id, phase]));
  const violations: Array<Record<string, unknown>> = [
    ...checkPhaseCount(phases, taskComplexity),
    ...checkDuplicateIds(phases),
    ...checkDanglingDependencies(phases),
    ...checkUnknownAgents(phases),
    ...checkAgentCapabilities(phases),
    ...checkCycles(phases, phaseById),
  ];

  if (violations.some((violation) => violation.rule === 'cyclic_dependency')) {
    return { valid: false, violations, parallelization_profile: null };
  }

  const depths = computeDepths(phases, phaseById);
  violations.push(
    ...checkFileOverlap(phases, depths),
    ...checkRedundantDependencies(phases, phaseById)
  );

  return {
    valid: violations.every((violation) => violation.severity === 'warning'),
    violations,
    parallelization_profile: buildParallelizationProfile(phases, phaseById),
  };
}

export { runPlanValidation };
