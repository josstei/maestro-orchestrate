'use strict';

const { PHASE_LIMITS, validatePhases } = require('../contracts/plan-schema');
const { normalizeAgentName, getAgentCapability } = require('../../core/agent-registry');

const WRITE_CAPABILITIES = new Set(['read_write', 'full']);

const CREATION_SIGNAL_PATTERN =
  /\b(implement|create|build|scaffold|write|generate|set\s*up|develop)\b/i;

/**
 * Build a violation in its reported shape.
 *
 * @param {string} rule - Machine-readable rule identifier (e.g. `phase_count`)
 * @param {string} detail - Human-readable description of the violation
 * @param {'error'|'warning'} [severity='error'] - Violation severity
 * @returns {{ rule: string, detail: string, severity: string }}
 */
function violation(rule, detail, severity = 'error') {
  return { rule, detail, severity };
}

/**
 * The plan must be an object with a phases array whose phases pass the shared
 * phase schema; every later check relies on both.
 */
function checkStructure(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.phases)) {
    return [violation('invalid_plan', 'plan must be an object with a phases array')];
  }
  return validatePhases(plan.phases).map(({ rule, phase_id, field }) => ({
    ...violation(rule, `Phase ${phase_id ?? '?'} field "${field}" ${rule.replace('_', ' ')}`),
    phase_id,
    field,
  }));
}

/**
 * Enforce the PHASE_LIMITS budget. Tool arguments are not checked against the
 * input schema, so a missing or unknown task_complexity reaches here; it gets
 * no limit.
 */
function checkPhaseCount(phases, taskComplexity) {
  const limit = PHASE_LIMITS[taskComplexity] || Infinity;
  if (phases.length > limit) {
    return [
      violation('phase_count', `${taskComplexity} tasks allow max ${limit} phases, got ${phases.length}`),
    ];
  }
  return [];
}

/** Flag each repeat of a phase id, then each blocked_by entry that names no phase. */
function checkIds(phases) {
  const violations = [];
  const ids = new Set();
  for (const phase of phases) {
    if (ids.has(phase.id)) {
      violations.push(violation('duplicate_id', `Duplicate phase ID: ${phase.id}`));
    }
    ids.add(phase.id);
  }
  for (const phase of phases) {
    for (const dependencyId of phase.blocked_by) {
      if (!ids.has(dependencyId)) {
        violations.push(
          violation(
            'dangling_dependency',
            `Phase ${phase.id} references non-existent dependency: ${dependencyId}`
          )
        );
      }
    }
  }
  return violations;
}

/**
 * The files a phase claims: the planning-time `files` manifest plus the
 * `files_created` / `files_modified` manifests transition_phase records, so a
 * plan that already ran can be re-validated. A non-array field claims nothing.
 */
function claimedFiles(phase) {
  return ['files', 'files_created', 'files_modified'].flatMap((field) =>
    Array.isArray(phase[field]) ? phase[field] : []
  );
}

/**
 * Report every unknown agent, then every agent that cannot deliver its phase:
 * an error when an agent without write access gets a phase that claims files,
 * otherwise a warning when a read_only agent gets a phase whose name suggests
 * creating files.
 */
function checkAgents(phases) {
  const unknown = [];
  const mismatches = [];
  for (const phase of phases) {
    const capability = getAgentCapability(phase.agent);
    if (capability === null) {
      unknown.push(
        violation(
          'unknown_agent',
          `Phase ${phase.id}: unknown agent "${phase.agent}" (normalized: "${normalizeAgentName(phase.agent)}")`
        )
      );
    }

    if (claimedFiles(phase).length > 0 && !WRITE_CAPABILITIES.has(capability)) {
      mismatches.push(
        violation(
          'agent_capability_mismatch',
          `Phase ${phase.id}: agent '${phase.agent}' (${capability}) cannot deliver file-creating tasks. Use a write-capable agent (coder, data_engineer, etc.) or split into analysis + implementation phases.`
        )
      );
    } else if (capability === 'read_only' && CREATION_SIGNAL_PATTERN.test(phase.name)) {
      mismatches.push(
        violation(
          'agent_capability_mismatch',
          `Phase ${phase.id}: agent '${phase.agent}' (read_only) assigned to phase '${phase.name}' which may require file creation. Verify this agent can deliver the phase's requirements.`,
          'warning'
        )
      );
    }
  }
  return [...unknown, ...mismatches];
}

/**
 * Walk the blocked_by graph. A cycle yields a single `cyclic_dependency`
 * violation naming the phase whose walk reached it (not necessarily a phase on
 * the cycle) and no profile. Otherwise report `file_overlap` between parallel
 * phases at the same depth (phases at different depths run sequentially),
 * then at most one `redundant_dependency` per phase, and build the
 * parallelization profile.
 *
 * @returns {{ violations: object[], profile: object|null }}
 */
function checkDependencyGraph(phases) {
  // A repeated id resolves to its last phase; an id no phase declares has no blockers.
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const blockersOf = (id) => phaseById.get(id)?.blocked_by ?? [];

  // Depth of each id reached (its longest blocked_by chain); -1 while its walk is in progress.
  const depths = new Map();
  function depthOf(id) {
    if (depths.has(id)) {
      return depths.get(id);
    }
    depths.set(id, -1);
    let depth = 0;
    for (const blockerId of blockersOf(id)) {
      const blockerDepth = depthOf(blockerId);
      if (blockerDepth === -1) {
        return -1;
      }
      depth = Math.max(depth, blockerDepth + 1);
    }
    depths.set(id, depth);
    return depth;
  }

  for (const phase of phases) {
    if (depthOf(phase.id) === -1) {
      return {
        violations: [violation('cyclic_dependency', `Cycle detected involving phase ${phase.id}`)],
        profile: null,
      };
    }
  }

  /** [depth, phases] pairs by ascending depth, phases in input order. */
  const groupByDepth = (list) => {
    const groups = new Map();
    for (const phase of list) {
      const depth = depths.get(phase.id);
      const group = groups.get(depth);
      if (group) {
        group.push(phase);
      } else {
        groups.set(depth, [phase]);
      }
    }
    return [...groups].sort(([a], [b]) => a - b);
  };

  const violations = [];
  for (const [, batch] of groupByDepth(phases.filter((phase) => phase.parallel))) {
    if (batch.length < 2) {
      continue;
    }
    // File paths compare as the text the detail prints.
    const owners = new Map();
    for (const phase of batch) {
      for (const file of claimedFiles(phase)) {
        const key = String(file);
        if (owners.has(key)) {
          violations.push(
            violation('file_overlap', `Parallel phases ${owners.get(key)} and ${phase.id} both touch "${file}"`)
          );
        } else {
          owners.set(key, phase.id);
        }
      }
    }
  }

  // Every id reachable through blocked_by chains, memoized per id.
  const reachable = new Map();
  function reachableFrom(id) {
    if (!reachable.has(id)) {
      reachable.set(
        id,
        new Set(blockersOf(id).flatMap((blockerId) => [blockerId, ...reachableFrom(blockerId)]))
      );
    }
    return reachable.get(id);
  }

  for (const phase of phases) {
    const dependencies = phase.blocked_by;
    for (const dependencyId of dependencies) {
      const viaId = dependencies.find(
        (otherId) => otherId !== dependencyId && reachableFrom(otherId).has(dependencyId)
      );
      if (viaId !== undefined) {
        violations.push(
          violation(
            'redundant_dependency',
            `Phase ${phase.id}: dependency on phase ${dependencyId} is redundant (already reachable via phase ${viaId})`,
            'warning'
          )
        );
        break; // At most one redundant edge is reported per phase.
      }
    }
  }

  const batches = groupByDepth(phases).map(([depth, group]) => ({
    depth,
    phase_ids: group.map((phase) => phase.id),
  }));
  return {
    violations,
    profile: {
      total_phases: phases.length,
      // Every id reached, dangling blockers included, in first-visit order.
      depth_map: Object.fromEntries(depths),
      batches,
      // -Infinity (null on the wire) for an empty plan.
      max_batch_size: Math.max(...batches.map((batch) => batch.phase_ids.length)),
      parallel_eligible: batches
        .filter((batch) => batch.phase_ids.length > 1)
        .reduce((sum, batch) => sum + batch.phase_ids.length, 0),
      effective_batches: batches.length,
    },
  };
}

/**
 * validate_plan: structure first (an invalid plan gets only those violations),
 * then phase count, ids, agents and the dependency graph, in that order. The
 * plan is valid when every violation is a warning.
 */
function handleValidatePlan(params) {
  const { plan, task_complexity: taskComplexity } = params;

  const structureViolations = checkStructure(plan);
  if (structureViolations.length > 0) {
    return {
      valid: false,
      violations: structureViolations,
      parallelization_profile: null,
    };
  }

  const { phases } = plan;
  const graph = checkDependencyGraph(phases);
  const violations = [
    ...checkPhaseCount(phases, taskComplexity),
    ...checkIds(phases),
    ...checkAgents(phases),
    ...graph.violations,
  ];

  return {
    valid: violations.every(({ severity }) => severity === 'warning'),
    violations,
    parallelization_profile: graph.profile,
  };
}

module.exports = {
  handleValidatePlan,
};
