'use strict';

const { StateError } = require('../../lib/errors');
const { PHASE_LIMITS, validatePhases } = require('../contracts/plan-schema');
const {
  KNOWN_AGENTS,
  normalizeAgentName,
  getAgentCapability,
} = require('../../core/agent-registry');

const CREATION_SIGNAL_PATTERNS =
  /\b(implement|create|build|scaffold|write|generate|set\s*up|develop)\b/i;

/**
 * Group phases by their depth in `depths`, preserving input order within each
 * group. Keys follow object-key order: integer depths ascending.
 */
function groupByDepth(phases, depths) {
  const groups = {};
  for (const phase of phases) {
    const depth = depths[phase.id] || 0;
    groups[depth] = groups[depth] || [];
    groups[depth].push(phase);
  }
  return groups;
}

/**
 * Check the plan shape, then the shared phase contract, reporting the phase
 * violations in the validate_plan response format.
 */
function checkPlanStructure(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.phases)) {
    return [{ rule: 'invalid_plan', detail: 'plan must be an object with a phases array', severity: 'error' }];
  }
  return validatePhases(plan.phases).violations.map(({ rule, phase_id, field }) => ({
    rule,
    detail: `Phase ${phase_id ?? '?'} field "${field}" ${rule.replace('_', ' ')}`,
    severity: 'error',
    phase_id,
    field,
  }));
}

/**
 * Validates the phases of a structurally valid plan, collecting violations in
 * diagnostic order. Each check is a separate pass; the passes after
 * `checkCycles` run only on an acyclic graph.
 */
class PlanValidator {
  constructor(phases) {
    this.phases = phases;
    this.phaseById = new Map(phases.map((phase) => [phase.id, phase]));
    this.violations = [];
  }

  report(rule, detail, severity = 'error') {
    this.violations.push({ rule, detail, severity });
  }

  /** The ids `id` is blocked by; empty for root phases and for ids no phase declares. */
  blockersOf(id) {
    const phase = this.phaseById.get(id);
    return (phase && phase.blocked_by) || [];
  }

  /** The phase budget, duplicate IDs, and dangling dependencies, in that order. */
  checkConstraints(taskComplexity) {
    const limit = PHASE_LIMITS[taskComplexity] || Infinity;
    if (this.phases.length > limit) {
      this.report('phase_count', `${taskComplexity} tasks allow max ${limit} phases, got ${this.phases.length}`);
    }
    const seenIds = new Set();
    for (const { id } of this.phases) {
      if (seenIds.has(id)) this.report('duplicate_id', `Duplicate phase ID: ${id}`);
      seenIds.add(id);
    }
    for (const phase of this.phases) {
      for (const dependencyId of phase.blocked_by) {
        if (!this.phaseById.has(dependencyId)) {
          this.report('dangling_dependency', `Phase ${phase.id} references non-existent dependency: ${dependencyId}`);
        }
      }
    }
  }

  checkUnknownAgents() {
    for (const phase of this.phases) {
      const normalizedAgent = normalizeAgentName(phase.agent);
      if (!KNOWN_AGENTS.includes(normalizedAgent)) {
        this.report(
          'unknown_agent',
          `Phase ${phase.id}: unknown agent "${phase.agent}" (normalized: "${normalizedAgent}")`
        );
      }
    }
  }

  /**
   * A phase declaring `files`, `files_created` or `files_modified` needs a
   * write-capable agent; a read-only agent on a phase whose name hints at
   * creation is a warning.
   */
  checkAgentCapabilities() {
    for (const phase of this.phases) {
      const capability = getAgentCapability(phase.agent);
      const touchesFiles = ['files', 'files_created', 'files_modified'].some(
        (field) => Array.isArray(phase[field]) && phase[field].length > 0
      );
      if (touchesFiles && !['read_write', 'full'].includes(capability)) {
        this.report(
          'agent_capability_mismatch',
          `Phase ${phase.id}: agent '${phase.agent}' (${capability}) cannot deliver file-creating tasks. ` +
          'Use a write-capable agent (coder, data_engineer, etc.) or split into analysis + implementation phases.'
        );
      } else if (capability === 'read_only' && CREATION_SIGNAL_PATTERNS.test(phase.name)) {
        this.report(
          'agent_capability_mismatch',
          `Phase ${phase.id}: agent '${phase.agent}' (read_only) assigned to phase '${phase.name}' ` +
          "which may require file creation. Verify this agent can deliver the phase's requirements.",
          'warning'
        );
      }
    }
  }

  /** Depth-first search reporting the first phase that reaches a back-edge; true when acyclic. */
  checkCycles() {
    const onStack = new Map(); // id -> true while on the DFS stack, false once finished
    const hasCycle = (id) => {
      if (onStack.has(id)) return onStack.get(id);
      onStack.set(id, true);
      if (this.blockersOf(id).some(hasCycle)) return true;
      onStack.set(id, false);
      return false;
    };
    const cyclic = this.phases.find((phase) => hasCycle(phase.id));
    if (cyclic) this.report('cyclic_dependency', `Cycle detected involving phase ${cyclic.id}`);
    return !cyclic;
  }

  /**
   * Longest incoming dependency chain per id (roots are 0). Ids key an object
   * here, so 1 and '1', which `checkCycles` keeps apart, can still meet as a cycle.
   */
  computeDepths() {
    const depths = {};
    const depthOf = (id) => {
      if (depths[id] === -1) throw new StateError('computeDepths: unexpected cycle detected');
      if (depths[id] === undefined) {
        depths[id] = -1;
        depths[id] = Math.max(-1, ...this.blockersOf(id).map(depthOf)) + 1;
      }
      return depths[id];
    };
    for (const phase of this.phases) depthOf(phase.id);
    return depths;
  }

  /**
   * Two `parallel` phases at the same depth must not both own a file. Ownership
   * is the planning-time `files` plus the runtime `files_created` /
   * `files_modified` of a plan being re-validated after execution.
   */
  checkFileOverlap(depths) {
    const parallelPhases = this.phases.filter((phase) => phase.parallel);
    for (const batch of Object.values(groupByDepth(parallelPhases, depths))) {
      if (batch.length < 2) continue;
      const fileOwners = {};
      for (const phase of batch) {
        for (const file of [...(phase.files || []), ...(phase.files_created || []), ...(phase.files_modified || [])]) {
          if (fileOwners[file]) {
            this.report('file_overlap', `Parallel phases ${fileOwners[file]} and ${phase.id} both touch "${file}"`);
          } else {
            fileOwners[file] = phase.id;
          }
        }
      }
    }
  }

  /** Reports at most one blocked_by edge per phase that a sibling dependency already reaches. */
  checkRedundantDependencies() {
    const memo = {};
    const getTransitiveDependencies = (phaseId) => {
      if (!memo[phaseId]) {
        const result = new Set();
        for (const dependencyId of this.blockersOf(phaseId)) {
          result.add(dependencyId);
          for (const transitive of getTransitiveDependencies(dependencyId)) result.add(transitive);
        }
        memo[phaseId] = result;
      }
      return memo[phaseId];
    };
    for (const { id, blocked_by: dependencies } of this.phases) {
      for (const dependencyId of dependencies) {
        const viaId = dependencies.find(
          (otherId) => otherId !== dependencyId && getTransitiveDependencies(otherId).has(dependencyId)
        );
        if (viaId !== undefined) {
          this.report(
            'redundant_dependency',
            `Phase ${id}: dependency on phase ${dependencyId} is redundant (already reachable via phase ${viaId})`,
            'warning'
          );
          break;
        }
      }
    }
  }

  parallelizationProfile(depths) {
    const batches = Object.entries(groupByDepth(this.phases, depths)).map(([depth, group]) => ({
      depth: Number(depth),
      phase_ids: group.map((phase) => phase.id),
    }));
    const sizes = batches.map((batch) => batch.phase_ids.length);
    return {
      total_phases: this.phases.length,
      depth_map: depths,
      batches,
      max_batch_size: Math.max(...sizes),
      parallel_eligible: sizes.filter((size) => size > 1).reduce((sum, size) => sum + size, 0),
      effective_batches: batches.length,
    };
  }

  validate(taskComplexity) {
    this.checkConstraints(taskComplexity);
    this.checkUnknownAgents();
    this.checkAgentCapabilities();
    let profile = null;
    if (this.checkCycles()) {
      const depths = this.computeDepths();
      this.checkFileOverlap(depths);
      this.checkRedundantDependencies();
      profile = this.parallelizationProfile(depths);
    }
    return {
      valid: this.violations.every((violation) => violation.severity === 'warning'),
      violations: this.violations,
      parallelization_profile: profile,
    };
  }
}

function handleValidatePlan({ plan, task_complexity: taskComplexity }) {
  const violations = checkPlanStructure(plan);
  if (violations.length > 0) return { valid: false, violations, parallelization_profile: null };
  return new PlanValidator(plan.phases).validate(taskComplexity);
}

module.exports = {
  handleValidatePlan,
};
