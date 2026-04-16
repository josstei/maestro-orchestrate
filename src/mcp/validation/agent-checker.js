'use strict';

const {
  KNOWN_AGENTS,
  normalizeAgentName,
  getAgentCapability,
  canCreateFiles,
} = require('../../core/agent-registry');

const CREATION_SIGNAL_PATTERNS =
  /\b(implement|create|build|scaffold|write|generate|set\s*up|develop)\b/i;

/**
 * Verify each phase's declared agent is known to the registry.
 */
function checkUnknownAgents(phases) {
  const violations = [];
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
  return violations;
}

/**
 * Catch mismatches between an agent's write capability and a phase's
 * file-touching workload. Read-only agents assigned to phases that
 * declare `files_created` or `files_modified` emit an error; read-only
 * agents assigned to phases whose name hints at creation emit a warning.
 */
function checkAgentCapabilities(phases) {
  const violations = [];
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
  return violations;
}

module.exports = {
  CREATION_SIGNAL_PATTERNS,
  checkUnknownAgents,
  checkAgentCapabilities,
};
