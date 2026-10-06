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
 * Memoized via `memo` so repeated callers share state.
 */
function getTransitiveDependencies(phaseId, phaseById, memo) {
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
      return [
        {
          rule: 'cyclic_dependency',
          detail: `Cycle detected involving phase ${phase.id}`,
          severity: 'error',
        },
      ];
    }
  }

  return [];
}

/**
 * Flag a blocked_by edge as redundant when the same blocker is already
 * reachable transitively through a sibling dependency.
 */
function checkRedundantDependencies(phases, phaseById) {
  const violations = [];
  const memo = {};

  for (const phase of phases) {
    const dependencies = phase.blocked_by || [];
    // At most one redundant edge is reported per phase.
    phaseScan: for (const dependencyId of dependencies) {
      for (const otherDependencyId of dependencies) {
        if (otherDependencyId === dependencyId) {
          continue;
        }
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
          break phaseScan;
        }
      }
    }
  }

  return violations;
}

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
 * Emit `file_overlap` violations when two phases marked `parallel` at
 * the same dependency depth both declare ownership of the same file.
 * Phases at different depths can safely touch the same file because
 * they run sequentially.
 *
 * Ownership is the union of:
 *   - `files` — the planning-time manifest (canonical plan input)
 *   - `files_created` / `files_modified` — runtime-populated manifests
 *     from previous executions of the plan (included for plans that
 *     were already executed and are being re-validated against updated
 *     rules).
 */
function checkFileOverlap(phases, depths) {
  const violations = [];
  const parallelPhases = phases.filter((phase) => phase.parallel);

  for (const batch of Object.values(groupByDepth(parallelPhases, depths))) {
    if (batch.length < 2) {
      continue;
    }

    const fileOwners = {};
    for (const phase of batch) {
      const files = [
        ...(phase.files || []),
        ...(phase.files_created || []),
        ...(phase.files_modified || []),
      ];

      for (const file of files) {
        if (fileOwners[file]) {
          violations.push({
            rule: 'file_overlap',
            detail: `Parallel phases ${fileOwners[file]} and ${phase.id} both touch "${file}"`,
            severity: 'error',
          });
        } else {
          fileOwners[file] = phase.id;
        }
      }
    }
  }

  return violations;
}

/**
 * Build the parallelization profile (depth-based batches, eligible count,
 * maximum batch size) for the plan from the depths computed by computeDepths.
 */
function buildParallelizationProfile(phases, depths) {
  const batches = Object.entries(groupByDepth(phases, depths)).map(
    ([depth, group]) => ({
      depth: Number(depth),
      phase_ids: group.map((phase) => phase.id),
    })
  );

  return {
    total_phases: phases.length,
    depth_map: depths,
    batches,
    max_batch_size: Math.max(...batches.map((batch) => batch.phase_ids.length)),
    parallel_eligible: batches
      .filter((batch) => batch.phase_ids.length > 1)
      .reduce((sum, batch) => sum + batch.phase_ids.length, 0),
    effective_batches: batches.length,
  };
}

module.exports = {
  computeDepths,
  checkCycles,
  checkRedundantDependencies,
  checkFileOverlap,
  buildParallelizationProfile,
};
