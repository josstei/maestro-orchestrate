import coreCommands from '../entry-points/core-command-registry.js';
import entryPoints from '../entry-points/registry.js';
import { ValidationError } from '../lib/errors/index.js';
import type { CoreCommandRegistryEntry, EntryPointRegistryEntry, RegistryModel } from './types.js';

interface CrossReferenceInputs {
  agentNames: string[];
  resourceIds: string[];
  entryPoints: EntryPointRegistryEntry[];
  coreCommands: CoreCommandRegistryEntry[];
}

/**
 * Assert that every name referenced by an entry point or core command resolves
 * to a real agent name or resource id.
 * @param {{ agentNames: string[], resourceIds: string[], entryPoints: object[], coreCommands: object[] }} inputs
 * @throws {ValidationError}
 */
function validateCrossReferences({ agentNames, resourceIds, entryPoints, coreCommands }: CrossReferenceInputs): void {
  const agents = new Set(agentNames);
  const resources = new Set(resourceIds);
  const errors: string[] = [];

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
 * @param {RegistryModel} model - Registry data derived from the source tree
 * @returns {{ agentNames: string[], resourceIds: string[], entryPoints: object[], coreCommands: object[] }}
 */
async function collectCrossReferenceInputs(model: RegistryModel): Promise<CrossReferenceInputs> {
  return {
    agentNames: model.agents.map((agent) => agent.name),
    resourceIds: Object.keys(model.resources),
    entryPoints,
    coreCommands,
  };
}

/**
 * Build-time gate: fail generation on any unresolved cross-reference.
 * @param {RegistryModel} model - Registry data derived from the source tree
 * @throws {ValidationError}
 */
async function assertCrossReferences(model: RegistryModel): Promise<void> {
  validateCrossReferences(await collectCrossReferenceInputs(model));
}

export { validateCrossReferences, collectCrossReferenceInputs, assertCrossReferences };
