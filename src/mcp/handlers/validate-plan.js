'use strict';

const {
  KNOWN_AGENTS,
  normalizeAgentName,
  getAgentCapability,
  canCreateFiles,
} = require('../../core/agent-registry');

const PHASE_LIMITS = {
  simple: 3,
  medium: 5,
  complex: Infinity,
};

const CREATION_SIGNAL_PATTERNS =
  /\b(implement|create|build|scaffold|write|generate|set\s*up|develop)\b/i;

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
          throw new Error('computeDepths: unexpected cycle detected');
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

function handleValidatePlan(params) {
  const { plan, task_complexity: taskComplexity } = params;

  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.phases)) {
    return {
      valid: false,
      violations: [
        {
          rule: 'invalid_plan',
          detail: 'plan must be an object with a phases array',
          severity: 'error',
        },
      ],
    };
  }

  const phases = plan.phases;
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const violations = [];
  const limit = PHASE_LIMITS[taskComplexity] || Infinity;

  if (phases.length > limit) {
    violations.push({
      rule: 'phase_count',
      detail: `${taskComplexity} tasks allow max ${limit} phases, got ${phases.length}`,
      severity: 'error',
    });
  }

  const seenIds = new Set();
  for (const phase of phases) {
    if (seenIds.has(phase.id)) {
      violations.push({
        rule: 'duplicate_id',
        detail: `Duplicate phase ID: ${phase.id}`,
        severity: 'error',
      });
    }
    seenIds.add(phase.id);
  }

  const allIds = new Set(phases.map((phase) => phase.id));
  for (const phase of phases) {
    for (const dependencyId of phase.blocked_by || []) {
      if (!allIds.has(dependencyId)) {
        violations.push({
          rule: 'dangling_dependency',
          detail: `Phase ${phase.id} references non-existent dependency: ${dependencyId}`,
          severity: 'error',
        });
      }
    }
  }

  for (const phase of phases) {
    const normalizedAgent = normalizeAgentName(phase.agent);
    if (normalizedAgent && !KNOWN_AGENTS.includes(normalizedAgent)) {
      violations.push({
        rule: 'unknown_agent',
        detail: `Phase ${phase.id}: unknown agent "${phase.agent}" (normalized: "${normalizedAgent}")`,
        severity: 'error',
      });
    }
  }

  for (const phase of phases) {
    const normalizedAgent = normalizeAgentName(phase.agent);
    if (!normalizedAgent) {
      continue;
    }

    const touchesFiles =
      (Array.isArray(phase.files_created) && phase.files_created.length > 0) ||
      (Array.isArray(phase.files_modified) && phase.files_modified.length > 0);

    if (touchesFiles && !canCreateFiles(normalizedAgent)) {
      violations.push({
        rule: 'agent_capability_mismatch',
        detail: `Phase ${phase.id}: agent '${phase.agent}' (${getAgentCapability(
          normalizedAgent
        )}) cannot deliver file-creating tasks. Use a write-capable agent (coder, data_engineer, etc.) or split into analysis + implementation phases.`,
        severity: 'error',
      });
      continue;
    }

    if (
      !touchesFiles &&
      getAgentCapability(normalizedAgent) === 'read_only' &&
      phase.name &&
      CREATION_SIGNAL_PATTERNS.test(phase.name)
    ) {
      violations.push({
        rule: 'agent_capability_mismatch',
        detail: `Phase ${phase.id}: agent '${phase.agent}' (read_only) assigned to phase '${phase.name}' which may require file creation. Verify this agent can deliver the phase's requirements.`,
        severity: 'warning',
      });
    }
  }

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

  const hasCycleViolation = violations.some(
    (violation) => violation.rule === 'cyclic_dependency'
  );

  const parallelPhases = phases.filter((phase) => phase.parallel);
  if (parallelPhases.length > 0 && !hasCycleViolation) {
    const depths = computeDepths(phases, phaseById);
    const batchesByDepth = {};

    for (const phase of parallelPhases) {
      const depth = depths[phase.id] || 0;
      batchesByDepth[depth] = batchesByDepth[depth] || [];
      batchesByDepth[depth].push(phase);
    }

    for (const batch of Object.values(batchesByDepth)) {
      if (batch.length < 2) {
        continue;
      }

      const fileOwners = {};
      for (const phase of batch) {
        const files = [
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
  }

  if (!hasCycleViolation) {
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
            phaseById
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
  }

  let parallelization_profile = null;
  if (!hasCycleViolation) {
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

    parallelization_profile = {
      total_phases: phases.length,
      depth_map: depths,
      batches,
      max_batch_size: Math.max(...batches.map((batch) => batch.phase_ids.length)),
      parallel_eligible: parallelEligible,
      effective_batches: batches.length,
    };
  }

  return {
    valid: violations.every((violation) => violation.severity === 'warning'),
    violations,
    parallelization_profile,
  };
}

module.exports = {
  handleValidatePlan,
};
