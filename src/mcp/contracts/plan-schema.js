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

const NON_EMPTY_STRING_SCHEMA = { type: 'string', minLength: 1 };

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

/**
 * The plan-phase fields, in schema order: the JSON schema tools/list shows,
 * the check validatePhases applies to a present field (a failure reports
 * `rule`, `invalid_field_type` unless given) and whether the field is required.
 */
const PHASE_FIELDS = {
  id: { schema: PHASE_ID_SCHEMA, isValid: isValidPhaseId, required: true },
  name: { schema: NON_EMPTY_STRING_SCHEMA, isValid: isNonEmptyString, required: true },
  agent: { schema: NON_EMPTY_STRING_SCHEMA, isValid: isNonEmptyString, required: true },
  parallel: { schema: { type: 'boolean' }, isValid: (value) => typeof value === 'boolean', required: true },
  blocked_by: {
    schema: { type: 'array', items: PHASE_ID_SCHEMA },
    isValid: isArrayOf(isValidPhaseId),
    required: true,
  },
  // The planning-time file manifest; create_session records it as the phase's planned_files.
  files: {
    schema: { type: 'array', items: NON_EMPTY_STRING_SCHEMA },
    isValid: isArrayOf(isNonEmptyString),
    rule: 'invalid_field_value',
  },
};

const REQUIRED_FIELDS = Object.keys(PHASE_FIELDS).filter((field) => PHASE_FIELDS[field].required);

const PHASE_ITEM_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(
    Object.entries(PHASE_FIELDS).map(([field, { schema }]) => [field, schema])
  ),
  required: REQUIRED_FIELDS,
  additionalProperties: true,
};

/**
 * Validate plan phases against PHASE_FIELDS: for each phase, every missing
 * required field, then every present field that fails its check. A phase that
 * is not an object has none of the fields.
 *
 * The runtime-populated manifests (`files_created`, `files_modified`,
 * `files_deleted`) are not plan inputs: transition_phase sets them after an
 * agent completes, and they pass through `additionalProperties: true`
 * unchecked. Plan authors populate `files`.
 *
 * @param {unknown} phases - Input value expected to be an array of phase objects.
 * @returns {Array<object>} The violations; empty when the phases are valid.
 */
function validatePhases(phases) {
  if (!Array.isArray(phases)) {
    return [{ rule: 'invalid_phases', detail: 'phases must be an array', severity: 'error' }];
  }

  const violations = [];
  for (const phase of phases) {
    const phaseId = (phase && phase.id) ?? null;
    const report = (rule, field) =>
      violations.push({ rule, phase_id: phaseId, field, severity: 'error' });

    for (const field of REQUIRED_FIELDS) {
      if (!phase || !Object.hasOwn(phase, field)) {
        report('missing_required_field', field);
      }
    }

    if (!phase) continue;

    for (const [field, { isValid, rule = 'invalid_field_type' }] of Object.entries(PHASE_FIELDS)) {
      if (Object.hasOwn(phase, field) && !isValid(phase[field])) {
        report(rule, field);
      }
    }
  }

  return violations;
}

module.exports = {
  PHASE_ITEM_SCHEMA,
  PHASE_LIMITS,
  TASK_COMPLEXITY_SCHEMA,
  isValidPhaseId,
  validatePhases,
};
