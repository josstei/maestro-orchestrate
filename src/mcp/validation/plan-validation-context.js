import { computeDepths } from './dag-checker.js';

/**
 * Shared derivation context passed to every plan-validation rule. Wraps the raw
 * (plan, taskComplexity) inputs and lazily derives the artifacts individual rules
 * need — the phase-by-id index and the topological depth map — memoizing each so
 * they are computed at most once per validation run.
 */
class PlanValidationContext {
  /**
   * @param {unknown} plan - The plan under validation.
   * @param {string} taskComplexity - Complexity classification ('simple' | 'medium' | 'complex').
   */
  constructor(plan, taskComplexity) {
    this._plan = plan;
    this._taskComplexity = taskComplexity;
    this._phaseById = null;
    this._depths = null;
  }

  /** @returns {unknown} The raw plan input. */
  get plan() {
    return this._plan;
  }

  /** @returns {string} The task-complexity classification. */
  get taskComplexity() {
    return this._taskComplexity;
  }

  /** @returns {Array<object>} The plan's phase list, or [] when the plan is malformed. */
  get phases() {
    return this._plan && Array.isArray(this._plan.phases) ? this._plan.phases : [];
  }

  /** @returns {Map<string|number, object>} Memoized phase-id -> phase index. */
  get phaseById() {
    if (this._phaseById === null) {
      this._phaseById = new Map(this.phases.map((phase) => [phase.id, phase]));
    }
    return this._phaseById;
  }

  /**
   * Memoized topological depth map. Only safe to read on a cycle-free graph;
   * callers gate this behind cycle detection (computeDepths throws on a cycle).
   *
   * @returns {Record<string|number, number>} phase id -> depth (roots at 0).
   */
  get depths() {
    if (this._depths === null) {
      this._depths = computeDepths(this.phases, this.phaseById);
    }
    return this._depths;
  }
}

export { PlanValidationContext };
