import { checkPlanShape, checkPhaseCount, checkDuplicateIds, checkDanglingDependencies, checkPhaseFieldSchema, } from './schema-checker.js';
import { checkUnknownAgents, checkAgentCapabilities } from './agent-checker.js';
import { checkCycles, checkRedundantDependencies } from './dag-checker.js';
import { checkFileOverlap } from './file-overlap-checker.js';
/**
 * @typedef {import('./plan-validation-context').PlanValidationContext} PlanValidationContext
 */
/**
 * @typedef {Object} PlanValidationRule
 * @property {string} id - Unique rule identifier.
 * @property {(context: PlanValidationContext) => Array<object>} evaluate - Emit zero or more violations.
 */
/**
 * @typedef {Object} PlanValidationStage
 * @property {string} id - Stage identifier.
 * @property {ReadonlyArray<PlanValidationRule>} rules - Rules evaluated in order.
 * @property {boolean} haltOnError - Stop the pipeline after this stage if it emitted any error.
 * @property {(context: PlanValidationContext, violations: Array<object>) => boolean} [guard] - Stage runs only when this returns true.
 * @property {boolean} [buildsProfile] - Marks the stage whose success authorizes the parallelization profile.
 */
/**
 * The depth stage may only run on a cycle-free graph, because computeDepths
 * throws on a cycle. Mirrors the original `hasCycleViolation` gate.
 *
 * @param {PlanValidationContext} _context
 * @param {Array<object>} violations - Violations accumulated by earlier stages.
 * @returns {boolean}
 */
function cycleFreeGuard(_context, violations) {
    return !violations.some((violation) => violation.rule === 'cyclic_dependency');
}
/** @type {ReadonlyArray<PlanValidationStage>} */
const PLAN_VALIDATION_STAGES = Object.freeze([
    Object.freeze({
        id: 'structure',
        haltOnError: true,
        rules: Object.freeze([
            Object.freeze({ id: 'plan_shape', evaluate: (c) => checkPlanShape(c.plan) }),
        ]),
    }),
    Object.freeze({
        id: 'phase-schema',
        haltOnError: true,
        rules: Object.freeze([
            Object.freeze({ id: 'phase_field_schema', evaluate: (c) => checkPhaseFieldSchema(c.phases) }),
        ]),
    }),
    Object.freeze({
        id: 'graph',
        haltOnError: false,
        rules: Object.freeze([
            Object.freeze({ id: 'phase_count', evaluate: (c) => checkPhaseCount(c.phases, c.taskComplexity) }),
            Object.freeze({ id: 'duplicate_id', evaluate: (c) => checkDuplicateIds(c.phases) }),
            Object.freeze({ id: 'dangling_dependency', evaluate: (c) => checkDanglingDependencies(c.phases) }),
            Object.freeze({ id: 'unknown_agent', evaluate: (c) => checkUnknownAgents(c.phases) }),
            Object.freeze({ id: 'agent_capability', evaluate: (c) => checkAgentCapabilities(c.phases) }),
            Object.freeze({ id: 'cyclic_dependency', evaluate: (c) => checkCycles(c.phases, c.phaseById) }),
        ]),
    }),
    Object.freeze({
        id: 'dependency-depth',
        haltOnError: false,
        guard: cycleFreeGuard,
        buildsProfile: true,
        rules: Object.freeze([
            Object.freeze({ id: 'file_overlap', evaluate: (c) => checkFileOverlap(c.phases, c.depths) }),
            Object.freeze({ id: 'redundant_dependency', evaluate: (c) => checkRedundantDependencies(c.phases, c.phaseById) }),
        ]),
    }),
]);
export { PLAN_VALIDATION_STAGES, cycleFreeGuard };
