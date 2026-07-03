'use strict';

const { runPlanValidation } = require('../validation/plan-validation-pipeline');

/**
 * MCP handler for the `validate_plan` tool. Delegates to the staged
 * plan-validation pipeline; new rules are registered in the rule registry
 * (`src/mcp/validation/rule-registry.js`), never added here.
 *
 * @param {{ plan: unknown, task_complexity: string }} params
 * @returns {{ valid: boolean, violations: Array<object>, parallelization_profile: (object|null) }}
 */
function handleValidatePlan(params) {
  const { plan, task_complexity: taskComplexity } = params;
  return runPlanValidation(plan, taskComplexity);
}

module.exports = { handleValidatePlan };
