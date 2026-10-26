'use strict';

/** Maximum phases per task_complexity; its keys are the accepted complexity values. */
const PHASE_LIMITS = {
  simple: 3,
  medium: 5,
  complex: Infinity,
};

const TASK_COMPLEXITY_SCHEMA = { type: 'string', enum: Object.keys(PHASE_LIMITS) };

const PHASE_ID_SCHEMA = {
  oneOf: [
    { type: 'integer', minimum: 1 },
    { type: 'string', minLength: 1 },
  ],
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

// Each field owns its advertised schema and runtime validation. Declaration
// order also determines missing-field and invalid-field violation ordering.
const PHASE_FIELDS = {
  id: { schema: PHASE_ID_SCHEMA, isValid: isValidPhaseId },
  name: { schema: { type: 'string', minLength: 1 }, isValid: isNonEmptyString },
  agent: { schema: { type: 'string', minLength: 1 }, isValid: isNonEmptyString },
  parallel: { schema: { type: 'boolean' }, isValid: (value) => typeof value === 'boolean' },
  blocked_by: { schema: { type: 'array', items: PHASE_ID_SCHEMA }, isValid: isArrayOf(isValidPhaseId) },
  files: {
    schema: { type: 'array', items: { type: 'string', minLength: 1 } },
    isValid: isArrayOf(isNonEmptyString),
    optional: true,
    rule: 'invalid_field_value',
  },
};
const FIELD_RULES = Object.entries(PHASE_FIELDS);
const PHASE_REQUIRED_FIELDS = FIELD_RULES
  .filter(([, definition]) => !definition.optional)
  .map(([field]) => field);
const PHASE_ITEM_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(FIELD_RULES.map(([field, { schema }]) => [field, schema])),
  required: PHASE_REQUIRED_FIELDS,
  additionalProperties: true,
};

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
  if (!Array.isArray(phases)) {
    return {
      valid: false,
      violations: [
        { rule: 'invalid_phases', detail: 'phases must be an array', severity: 'error' },
      ],
    };
  }

  const violations = [];
  for (const phase of phases) {
    const phaseId = (phase && phase.id) ?? null;
    const report = (rule, field) =>
      violations.push({ rule, phase_id: phaseId, field, severity: 'error' });

    for (const field of PHASE_REQUIRED_FIELDS) {
      if (!phase || !Object.hasOwn(phase, field)) {
        report('missing_required_field', field);
      }
    }

    if (!phase) continue;

    for (const [field, { isValid, rule = 'invalid_field_type' }] of FIELD_RULES) {
      if (field in phase && !isValid(phase[field])) {
        report(rule, field);
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

module.exports = {
  PHASE_ITEM_SCHEMA,
  PHASE_LIMITS,
  TASK_COMPLEXITY_SCHEMA,
  isValidPhaseId,
  validatePhases,
};
