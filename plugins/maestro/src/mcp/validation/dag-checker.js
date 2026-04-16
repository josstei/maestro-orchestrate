'use strict';

const { StateError } = require('../../lib/errors');

/**
 * Compute the topological depth (longest incoming dependency chain) for
 * each phase. Throws if a cycle is reached — callers should run cycle
 * detection first.
 *
 * @returns {Record<string|number, number>} phase id -> depth (root phases have depth 0)
 */
function computeDepths(phases, phaseById) {
  const depthMap = {};

  function getDepth(id) {
    if (depthMap[id] !== undefined) {
      return depthMap[id];
    }

    const phase = phaseById.get(id);
    if (!phase || !phase.blocked_by || phase.blocked_by.length === 0) {
      depthMap[id] = 0;
      return 0;
    }

    depthMap[id] = -1;
    const maxBlockerDepth = Math.max(
      ...phase.blocked_by.map((blockedPhaseId) => {
        const depth = getDepth(blockedPhaseId);
        if (depth === -1) {
          throw new StateError('computeDepths: unexpected cycle detected');
        }
        return depth;
      })
    );
    depthMap[id] = maxBlockerDepth + 1;
    return depthMap[id];
  }

  for (const phase of phases) {
    getDepth(phase.id);
  }

  return depthMap;
}

/**
 * Compute the transitive closure of phase dependencies (reachable blockers).
 * Memoized via the optional `memo` parameter so repeated callers share state.
 */
function getTransitiveDependencies(phaseId, phaseById, memo = {}) {
  if (memo[phaseId]) {
    return memo[phaseId];
  }

  const phase = phaseById.get(phaseId);
  if (!phase || !phase.blocked_by || phase.blocked_by.length === 0) {
    memo[phaseId] = new Set();
    return memo[phaseId];
  }

  const result = new Set();
  for (const dependencyId of phase.blocked_by) {
    result.add(dependencyId);
    for (const transitiveDependency of getTransitiveDependencies(
      dependencyId,
      phaseById,
      memo
    )) {
      result.add(transitiveDependency);
    }
  }

  memo[phaseId] = result;
  return result;
}

/**
 * Depth-first cycle detection. Emits a single `cyclic_dependency`
 * violation identifying the first phase at which a back-edge was found.
 */
function checkCycles(phases, phaseById) {
  const violations = [];
  const visited = new Set();
  const inStack = new Set();

  function hasCycle(id) {
    if (inStack.has(id)) {
      return true;
    }

    if (visited.has(id)) {
      return false;
    }

    visited.add(id);
    inStack.add(id);

    const phase = phaseById.get(id);
    if (phase) {
      for (const dependencyId of phase.blocked_by || []) {
        if (hasCycle(dependencyId)) {
          return true;
        }
      }
    }

    inStack.delete(id);
    return false;
  }

  for (const phase of phases) {
    if (hasCycle(phase.id)) {
      violations.push({
        rule: 'cyclic_dependency',
        detail: `Cycle detected involving phase ${phase.id}`,
        severity: 'error',
      });
      break;
    }
  }

  return violations;
}

/**
 * Flag a blocked_by edge as redundant when the same blocker is already
 * reachable transitively through a sibling dependency.
 */
function checkRedundantDependencies(phases, phaseById) {
  const violations = [];
  const memo = {};

  for (const phase of phases) {
    if (!phase.blocked_by || phase.blocked_by.length < 2) {
      continue;
    }

    for (const dependencyId of phase.blocked_by) {
      const otherDependencies = phase.blocked_by.filter(
        (id) => id !== dependencyId
      );
      let redundant = false;

      for (const otherDependencyId of otherDependencies) {
        const transitiveDependencies = getTransitiveDependencies(
          otherDependencyId,
          phaseById,
          memo
        );
        if (transitiveDependencies.has(dependencyId)) {
          violations.push({
            rule: 'redundant_dependency',
            detail: `Phase ${phase.id}: dependency on phase ${dependencyId} is redundant (already reachable via phase ${otherDependencyId})`,
            severity: 'warning',
          });
          redundant = true;
          break;
        }
      }

      if (redundant) {
        break;
      }
    }
  }

  return violations;
}

/**
 * Build the parallelization profile (depth-based batches, eligible count,
 * maximum batch size) for the plan.
 */
function buildParallelizationProfile(phases, phaseById) {
  const depths = computeDepths(phases, phaseById);
  const batches = Object.entries(
    phases.reduce((acc, phase) => {
      const depth = depths[phase.id] || 0;
      acc[depth] = acc[depth] || [];
      acc[depth].push(phase.id);
      return acc;
    }, {})
  )
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([depth, phaseIds]) => ({
      depth: Number(depth),
      phase_ids: phaseIds,
    }));

  let parallelEligible = 0;
  for (const batch of batches) {
    if (batch.phase_ids.length > 1) {
      parallelEligible += batch.phase_ids.length;
    }
  }

  return {
    total_phases: phases.length,
    depth_map: depths,
    batches,
    max_batch_size: Math.max(...batches.map((batch) => batch.phase_ids.length)),
    parallel_eligible: parallelEligible,
    effective_batches: batches.length,
  };
}

module.exports = {
  computeDepths,
  getTransitiveDependencies,
  checkCycles,
  checkRedundantDependencies,
  buildParallelizationProfile,
};
