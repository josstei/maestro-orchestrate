import { PlanValidationContext } from './plan-validation-context.js';
import { PLAN_VALIDATION_STAGES } from './rule-registry.js';
import { buildParallelizationProfile } from './dag-checker.js';

/**
 * Execute a staged plan-validation registry against a plan and return the
 * canonical validation result. Reproduces the fail-fast gating of the original
 * monolithic handler: halt-on-error stages short-circuit with a null profile, a
 * stage guard may skip its stage, and the parallelization profile is built only
 * when the profile-producing stage actually ran.
 *
 * @param {unknown} plan - The plan under validation.
 * @param {string} taskComplexity - Complexity classification.
 * @param {ReadonlyArray<import('./rule-registry').PlanValidationStage>} [stages] - Registry to run; injectable for extension.
 * @returns {{ valid: boolean, violations: Array<object>, parallelization_profile: (object|null) }}
 */
function runPlanValidation(plan: any, taskComplexity: any, stages: any = PLAN_VALIDATION_STAGES) {
  const context = new PlanValidationContext(plan, taskComplexity);
  const violations = [];
  let profileStageRan = false;

  for (const stage of stages) {
    if (stage.guard && !stage.guard(context, violations)) {
      continue;
    }

    const stageViolations = [];
    for (const rule of stage.rules) {
      stageViolations.push(...rule.evaluate(context));
    }
    violations.push(...stageViolations);

    if (stage.haltOnError && stageViolations.some((violation: any) => violation.severity === 'error')) {
      return { valid: false, violations, parallelization_profile: null };
    }

    if (stage.buildsProfile) {
      profileStageRan = true;
    }
  }

  const parallelization_profile = profileStageRan
    ? buildParallelizationProfile(context.phases, context.phaseById)
    : null;

  return {
    valid: violations.every((violation: any) => violation.severity === 'warning'),
    violations,
    parallelization_profile,
  };
}

export { runPlanValidation };
