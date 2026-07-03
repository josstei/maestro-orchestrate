'use strict';

const { runPlanValidation } = require('../validation/plan-validation-pipeline');
const { handleGetAgentPerformance } = require('./agent-performance');

/**
 * MCP handler for the `validate_plan` tool. Delegates to the staged
 * plan-validation pipeline; new rules are registered in the rule registry
 * (`src/mcp/validation/rule-registry.js`), never added here. When a durable
 * agent-performance ledger is present it attaches per-agent priors as an
 * advisory, read-if-present field without influencing rule outcomes.
 *
 * @param {{ plan: unknown, task_complexity: string }} params
 * @param {string} projectRoot
 * @returns {{ valid: boolean, violations: Array<object>, parallelization_profile: (object|null), agent_priors?: object }}
 */
function handleValidatePlan(params, projectRoot) {
  const { plan, task_complexity: taskComplexity } = params;
  const result = runPlanValidation(plan, taskComplexity);
  if (projectRoot) {
    const priors = handleGetAgentPerformance({}, projectRoot).by_agent;
    if (priors && Object.keys(priors).length > 0) {
      result.agent_priors = priors;
    }
  }
  return result;
}

module.exports = { handleValidatePlan };
