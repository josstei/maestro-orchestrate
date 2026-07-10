import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleDirname } from '../core/module-path.js';
import { ValidationError } from '../lib/errors/index.js';
import type { EntryPointRegistryEntry, RegistryModel } from './types.js';

const DEFAULT_CODE_SRC = path.resolve(moduleDirname(import.meta.url), '..');

interface CrossReferenceInputs {
  agentNames: string[];
  resourceIds: string[];
  entryPoints: EntryPointRegistryEntry[];
  coreCommands: EntryPointRegistryEntry[];
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
async function collectCrossReferenceInputs(model: RegistryModel, codeSrcDir = DEFAULT_CODE_SRC): Promise<CrossReferenceInputs> {
  const { default: entryPoints } = await import(pathToFileURL(path.join(codeSrcDir, 'entry-points', 'registry.js')).href) as {
    default: EntryPointRegistryEntry[];
  };
  const { default: coreCommands } = await import(pathToFileURL(path.join(codeSrcDir, 'entry-points', 'core-command-registry.js')).href) as {
    default: EntryPointRegistryEntry[];
  };

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
async function assertCrossReferences(model: RegistryModel, codeSrcDir = DEFAULT_CODE_SRC): Promise<void> {
  validateCrossReferences(await collectCrossReferenceInputs(model, codeSrcDir));
}

export { validateCrossReferences, collectCrossReferenceInputs, assertCrossReferences };
