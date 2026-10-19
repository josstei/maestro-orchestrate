'use strict';

const PHASE_REQUIRED_FIELDS = ['id', 'name', 'agent', 'parallel', 'blocked_by'];

const PHASE_ID_SCHEMA = {
  oneOf: [
    { type: 'integer', minimum: 1 },
    { type: 'string', minLength: 1 },
  ],
};

const PHASE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    id: PHASE_ID_SCHEMA,
    name: { type: 'string', minLength: 1 },
    agent: { type: 'string', minLength: 1 },
    parallel: { type: 'boolean' },
    blocked_by: { type: 'array', items: PHASE_ID_SCHEMA },
    files: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
  required: PHASE_REQUIRED_FIELDS,
  additionalProperties: true,
};

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isValidPhaseId(value) {
  if (typeof value === 'string') return value.length > 0;
  return Number.isInteger(value) && value >= 1;
}

function isArrayOf(isItem) {
  return (value) => Array.isArray(value) && value.every(isItem);
}

// [field, violation rule, predicate] checked, in order, for each field a phase carries.
const FIELD_RULES = [
  ['id', 'invalid_field_type', isValidPhaseId],
  ['name', 'invalid_field_type', isNonEmptyString],
  ['agent', 'invalid_field_type', isNonEmptyString],
  ['parallel', 'invalid_field_type', (value) => typeof value === 'boolean'],
  ['blocked_by', 'invalid_field_type', isArrayOf(isValidPhaseId)],
  ['files', 'invalid_field_value', isArrayOf(isNonEmptyString)],
];

/**
 * Validate an array of plan-phase objects against the shared phase schema.
 *
 * Required fields per phase: id, name, agent, parallel, blocked_by.
 *
 * Optional field: `files` — the planning-time file manifest. When supplied,
 * T9 `create_session` maps it to the session state's `planned_files` field
 * for later reconciliation. The runtime-populated manifests
 * (`files_created`, `files_modified`, `files_deleted`) are NOT plan inputs;
 * they are set by `transition_phase` after an agent completes, and they
 * pass through this schema via `additionalProperties: true` without
 * validation. Plan authors should populate `files`, not the runtime fields.
 *
 * @param {unknown} phases - Input value expected to be an array of phase objects.
 * @returns {{ valid: boolean, violations: Array<object> }}
 */
function validatePhases(phases) {
  const violations = [];
  if (!Array.isArray(phases)) {
    return {
      valid: false,
      violations: [
        { rule: 'invalid_phases', detail: 'phases must be an array', severity: 'error' },
      ],
    };
  }

  for (const phase of phases) {
    const phaseId = phase && phase.id;
    for (const field of PHASE_REQUIRED_FIELDS) {
      if (!phase || !Object.prototype.hasOwnProperty.call(phase, field)) {
        violations.push({
          rule: 'missing_required_field',
          phase_id: phaseId ?? null,
          field,
          severity: 'error',
        });
      }
    }

    if (!phase) continue;

    for (const [field, rule, isValid] of FIELD_RULES) {
      if (field in phase && !isValid(phase[field])) {
        violations.push({
          rule,
          phase_id: phaseId ?? null,
          field,
          severity: 'error',
        });
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

module.exports = {
  PHASE_ITEM_SCHEMA,
  PHASE_REQUIRED_FIELDS,
  isValidPhaseId,
  validatePhases,
};
