'use strict';

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

/**
 * @typedef {Object} AuditSpec
 * @property {string} name - Canonical (kebab-case) entry-point name.
 * @property {Record<string, string>} [runtimeNames] - Per-runtime name remaps.
 * @property {string} description - One-line entry-point description.
 * @property {string} agent - The single specialist agent this audit delegates to.
 * @property {string[]} workflow - Ordered workflow steps.
 * @property {string[]} [skills] - Extra skills appended after 'delegation'.
 * @property {string[]} [refs] - Shared references to preload.
 * @property {string[]} [constraints] - Audit constraints; defaults to the shared presentation pair.
 */

/**
 * Build a standalone-audit entry-point registry entry from its varying data.
 * The shared skeleton — single-agent delegation, the 'delegation' skill, the
 * architecture reference, and the presentation-constraint default — is filled in
 * so a new pure audit is a four-field spec (name, description, agent, workflow).
 *
 * @param {AuditSpec} spec
 * @returns {object} A registry entry consumable by the entry-point expander.
 */
function defineAudit(spec) {
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

  const entry = {
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

module.exports = { defineAudit, AUDIT_PRESENTATION_CONSTRAINTS };
