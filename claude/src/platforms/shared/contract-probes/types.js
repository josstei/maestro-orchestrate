'use strict';

/**
 * Canonical RuntimeContract shape.
 *
 * A RuntimeContract is the OBSERVED state of a runtime's tool registry and
 * subagent registry, captured from a real CLI request payload. It is the
 * ground-truth shape that `runtime-config.js` claims to match.
 *
 * @typedef {Object} RuntimeContract
 * @property {string[]} registered_tools
 *   Names of tools the runtime registers (e.g. ["read_file", "invoke_agent"])
 * @property {string[]} subagent_registry_fields
 *   Names of frontmatter fields exposed to the model in the subagent registry
 *   block (e.g. ["name", "description"]). Empty array means no subagent
 *   registry block exists for this runtime.
 * @property {{ tool: string, params: string[] }} delegation_surface
 *   Tool name and required parameters for delegating to a subagent
 * @property {'enforced' | 'unverified' | 'unenforced'} frontmatter_enforcement
 *   Whether the runtime has been observed to enforce per-agent frontmatter
 *   (tools:, temperature:, max_turns:) at dispatch time
 */

const CONTRACT_REQUIRED_FIELDS = Object.freeze([
  'registered_tools',
  'subagent_registry_fields',
  'delegation_surface',
  'frontmatter_enforcement',
]);

function isRuntimeContract(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return CONTRACT_REQUIRED_FIELDS.every((field) =>
    Object.prototype.hasOwnProperty.call(value, field)
  );
}

module.exports = {
  CONTRACT_REQUIRED_FIELDS,
  isRuntimeContract,
};
