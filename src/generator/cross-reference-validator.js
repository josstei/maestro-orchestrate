import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ValidationError } from '../lib/errors/index.js';
import { buildRegistries } from './registry-scanner.js';

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
async function collectCrossReferenceInputs(srcDir) {
  const registries = buildRegistries(srcDir);
  const agentData = registries.find((r) => r.fileName === 'agent-registry.json').data;
  const resourceData = registries.find((r) => r.fileName === 'resource-registry.json').data;
  const { default: entryPoints } = await import(pathToFileURL(path.join(srcDir, 'entry-points', 'registry.js')).href);
  const { default: coreCommands } = await import(pathToFileURL(path.join(srcDir, 'entry-points', 'core-command-registry.js')).href);

  return {
    agentNames: agentData.map((agent) => agent.name),
    resourceIds: Object.keys(resourceData),
    entryPoints,
    coreCommands,
  };
}

/**
 * Build-time gate: fail generation on any unresolved cross-reference.
 * @param {string} srcDir - Absolute path to src/
 * @throws {ValidationError}
 */
async function assertCrossReferences(srcDir) {
  validateCrossReferences(await collectCrossReferenceInputs(srcDir));
}

export { validateCrossReferences, collectCrossReferenceInputs, assertCrossReferences };
