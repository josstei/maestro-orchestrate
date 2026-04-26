'use strict';

const { PHASE_KINDS } = require('./plan-schema');
const {
  normalizeDownstreamContext,
  isDownstreamContextPopulated,
  describeShape,
} = require('./downstream-context');

/**
 * Kind-aware handoff contracts.
 *
 * Each entry maps a phase `kind` (see {@link PHASE_KINDS}) to the
 * `required_fields` that must be present and non-empty on a handoff payload
 * for that kind. The list intentionally covers ONLY kind-specific
 * obligations; the universal "files changed implies populated
 * downstream_context" rule is enforced by {@link validateHandoff} regardless
 * of kind.
 *
 * @type {Readonly<Object<string, Readonly<{ required_fields: ReadonlyArray<string> }>>>}
 */
const HANDOFF_CONTRACTS = Object.freeze({
  implementation: Object.freeze({
    required_fields: Object.freeze([]),
  }),
  review: Object.freeze({
    required_fields: Object.freeze(['findings']),
  }),
  revision: Object.freeze({
    required_fields: Object.freeze(['addressed_finding_ids']),
  }),
  verification: Object.freeze({
    required_fields: Object.freeze(['final_artifacts']),
  }),
});

/**
 * Returns the canonical frozen contract for a known phase kind.
 *
 * @param {string} kind - One of {@link PHASE_KINDS}.
 * @returns {Readonly<{ required_fields: ReadonlyArray<string> }>}
 * @throws {Error} when `kind` is not in {@link PHASE_KINDS}.
 */
function describeHandoffContract(kind) {
  if (!PHASE_KINDS.includes(kind)) {
    throw new Error(
      `Unknown phase kind '${kind}'. Expected one of: ${PHASE_KINDS.join(', ')}.`
    );
  }
  return HANDOFF_CONTRACTS[kind];
}

function hasNonEmpty(payload, field) {
  if (!Object.prototype.hasOwnProperty.call(payload, field)) return false;
  const value = payload[field];
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/**
 * Validate a handoff payload against the contract for the given phase kind.
 *
 * Validation runs in two passes:
 *
 * 1. Kind-specific required-field check — only when `opts.strict !== false`.
 *    Each field listed by the kind's contract must satisfy a non-empty test
 *    (arrays must have length > 0, strings must have trimmed length > 0,
 *    other values must be non-null/undefined). Missing or empty fields emit
 *    `HANDOFF_FIELD_MISSING` violations.
 *
 * 2. Downstream-context check — ALWAYS runs, regardless of `strict`. When
 *    the payload reports any files in `files_created`, `files_modified`, or
 *    `files_deleted`, the `downstream_context` is normalized via
 *    {@link normalizeDownstreamContext} and required to be populated per
 *    {@link isDownstreamContextPopulated}. A failure emits a single
 *    `HANDOFF_INCOMPLETE` violation. This pass is preserved under
 *    `strict: false` so legacy/back-compat callers retain the rev-1
 *    no-orphan-files guarantee.
 *
 * The function does not mutate `payload`.
 *
 * @param {string} kind - One of {@link PHASE_KINDS}.
 * @param {object} payload - Handoff payload as supplied by the caller.
 * @param {{ strict?: boolean }} [opts] - When `strict === false`, the
 *   kind-specific check is skipped; any other value (including omitted)
 *   defaults to strict mode.
 * @returns {{ valid: boolean, violations: Array<{ code: string, field: string, message: string }> }}
 * @throws {Error} when `kind` is not in {@link PHASE_KINDS}.
 */
function validateHandoff(kind, payload, opts = {}) {
  const contract = describeHandoffContract(kind);
  const strict = opts.strict !== false;
  const violations = [];

  if (strict) {
    for (const field of contract.required_fields) {
      if (!hasNonEmpty(payload, field)) {
        violations.push({
          code: 'HANDOFF_FIELD_MISSING',
          field,
          message: `${kind} handoff requires non-empty '${field}'`,
        });
      }
    }
  }

  const filesCreated = payload.files_created ?? [];
  const filesModified = payload.files_modified ?? [];
  const filesDeleted = payload.files_deleted ?? [];
  const hasFiles =
    filesCreated.length + filesModified.length + filesDeleted.length > 0;

  if (hasFiles) {
    const ctx = normalizeDownstreamContext(payload.downstream_context);
    if (!isDownstreamContextPopulated(ctx)) {
      violations.push({
        code: 'HANDOFF_INCOMPLETE',
        field: 'downstream_context',
        message:
          `Phase produced files but downstream_context is empty after normalization. ${describeShape()}`,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}

module.exports = {
  HANDOFF_CONTRACTS,
  describeHandoffContract,
  validateHandoff,
};
