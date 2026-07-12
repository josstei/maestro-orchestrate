import type { EntryPointRegistryEntry } from '../../generator/types.js';

/**
 * The presentation-discipline constraints shared by the "pure" audit entry
 * points (SEO, accessibility, compliance). Frozen so no consumer mutates the
 * shared default.
 *
 * @type {ReadonlyArray<string>}
 */
const AUDIT_PRESENTATION_CONSTRAINTS = Object.freeze([
  'Present findings before proposing remediation',
  'Do not modify code without explicit user approval',
]);

interface AuditSpec {
  name: string;
  runtimeNames?: Record<string, string>;
  description: string;
  agent: string;
  workflow: string[];
  skills?: string[];
  refs?: string[];
  constraints?: readonly string[];
}

/**
 * Build a standalone-audit entry-point registry entry from its varying data.
 * The shared skeleton — single-agent delegation, the 'delegation' skill, the
 * architecture reference, and the presentation-constraint default — is filled in
 * so a new pure audit is a four-field spec (name, description, agent, workflow).
 *
 */
function defineAudit(spec: AuditSpec): EntryPointRegistryEntry {
  const {
    name,
    runtimeNames,
    description,
    agent,
    workflow,
    skills = [],
    refs = ['architecture'],
    constraints = AUDIT_PRESENTATION_CONSTRAINTS,
  } = spec;

  const entry: EntryPointRegistryEntry = {
    name,
    description,
    agents: [agent],
    skills: ['delegation', ...skills],
    refs,
    workflow,
    constraints,
  };

  if (runtimeNames) {
    entry.runtimeNames = runtimeNames;
  }

  return entry;
}

export { defineAudit, AUDIT_PRESENTATION_CONSTRAINTS };
