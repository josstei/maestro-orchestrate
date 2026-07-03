'use strict';

const path = require('node:path');
const { ValidationError } = require('../lib/errors');
const { buildRegistries } = require('./registry-scanner');

/**
 * Assert that every name referenced by an entry point or core command resolves
 * to a real agent name or resource id.
 * @param {{ agentNames: string[], resourceIds: string[], entryPoints: object[], coreCommands: object[] }} inputs
 * @throws {ValidationError}
 */
function validateCrossReferences({ agentNames, resourceIds, entryPoints, coreCommands }) {
  const agents = new Set(agentNames);
  const resources = new Set(resourceIds);
  const errors = [];

  for (const entry of entryPoints) {
    for (const agent of entry.agents || []) {
      if (!agents.has(agent)) {
        errors.push(`entry-point "${entry.name}" references unknown agent "${agent}"`);
      }
    }
    for (const skill of entry.skills || []) {
      if (!resources.has(skill)) {
        errors.push(`entry-point "${entry.name}" references unknown skill/resource "${skill}"`);
      }
    }
    for (const ref of entry.refs || []) {
      if (!resources.has(ref)) {
        errors.push(`entry-point "${entry.name}" references unknown ref/resource "${ref}"`);
      }
    }
  }

  for (const command of coreCommands) {
    for (const resourceId of command.preload || []) {
      if (!resources.has(resourceId)) {
        errors.push(`core command "${command.name}" preloads unknown resource "${resourceId}"`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(
      `Unresolved cross-references:\n  - ${errors.join('\n  - ')}`,
      { details: { errors } }
    );
  }
}

/**
 * Gather the agent names, resource ids, and entry-point registries the
 * cross-reference gate needs from the real source tree.
 * @param {string} srcDir - Absolute path to src/
 * @returns {{ agentNames: string[], resourceIds: string[], entryPoints: object[], coreCommands: object[] }}
 */
function collectCrossReferenceInputs(srcDir) {
  const registries = buildRegistries(srcDir);
  const agentData = registries.find((r) => r.fileName === 'agent-registry.json').data;
  const resourceData = registries.find((r) => r.fileName === 'resource-registry.json').data;

  return {
    agentNames: agentData.map((agent) => agent.name),
    resourceIds: Object.keys(resourceData),
    entryPoints: require(path.join(srcDir, 'entry-points', 'registry')),
    coreCommands: require(path.join(srcDir, 'entry-points', 'core-command-registry')),
  };
}

/**
 * Build-time gate: fail generation on any unresolved cross-reference.
 * @param {string} srcDir - Absolute path to src/
 * @throws {ValidationError}
 */
function assertCrossReferences(srcDir) {
  validateCrossReferences(collectCrossReferenceInputs(srcDir));
}

module.exports = {
  validateCrossReferences,
  collectCrossReferenceInputs,
  assertCrossReferences,
};
