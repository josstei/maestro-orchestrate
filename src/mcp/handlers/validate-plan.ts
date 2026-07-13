import { handleGetAgentPerformance } from './agent-performance.js';
import { runPlanValidation } from '../validation/plan-validation-pipeline.js';

/**
 * MCP handler for the `validate_plan` tool. When a durable agent-performance
 * ledger is present it attaches per-agent priors as an advisory, read-if-present
 * field without influencing rule outcomes.
 *
 * @param {{ plan: unknown, task_complexity: string }} params
 * @param {string} projectRoot
 * @returns {{ valid: boolean, violations: Array<object>, parallelization_profile: (object|null), agent_priors?: object }}
 */
function handleValidatePlan(params: any, projectRoot: any) {
  const { plan, task_complexity: taskComplexity } = params;
  const result: Record<string, any> = runPlanValidation(plan, taskComplexity);
  if (projectRoot) {
    const priors = handleGetAgentPerformance({}, projectRoot).by_agent;
    if (priors && Object.keys(priors).length > 0) {
      result.agent_priors = priors;
    }
  }
  return result;
}

export { handleValidatePlan };
