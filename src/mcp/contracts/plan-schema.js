const PHASE_REQUIRED_FIELDS = ['id', 'name', 'agent', 'parallel', 'blocked_by'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isValidPhaseId(value) {
  if (typeof value === 'string') return value.length > 0;
  return Number.isInteger(value) && value >= 1;
}

function isValidBlockerId(value) {
  if (typeof value === 'string') return value.length > 0;
  return Number.isInteger(value) && value >= 1;
}

const PHASE_FIELD_VALIDATORS = Object.freeze([
  { field: 'id', predicate: isValidPhaseId, rule: 'invalid_field_type' },
  { field: 'name', predicate: isNonEmptyString, rule: 'invalid_field_type' },
  { field: 'agent', predicate: isNonEmptyString, rule: 'invalid_field_type' },
  { field: 'parallel', predicate: (value) => typeof value === 'boolean', rule: 'invalid_field_type' },
  {
    field: 'blocked_by',
    predicate: (value) => Array.isArray(value) && value.every(isValidBlockerId),
    rule: 'invalid_field_type',
  },
  {
    field: 'files',
    predicate: (value) => Array.isArray(value) && value.every(isNonEmptyString),
    rule: 'invalid_field_value',
  },
]);

/**
 * Validate an array of plan-phase objects against the shared phase schema.
 *
 * Required fields per phase: id, name, agent, parallel, blocked_by.
 *
 * Optional field: `files` — the planning-time file manifest. When supplied,
 * T9 `create_session` maps it to the session state's `planned_files` field
 * for later reconciliation. The runtime-populated manifests
 * (`files_created`, `files_modified`, `files_deleted`) are NOT plan inputs;
 * they are set by `transition_phase` after an agent completes, and this
 * schema permits them to pass through unchecked since it does not reject
 * unrecognized fields. Plan authors should populate `files`, not the
 * runtime fields.
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

    for (const { field, predicate, rule } of PHASE_FIELD_VALIDATORS) {
      if (field in phase && !predicate(phase[field])) {
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

export { PHASE_REQUIRED_FIELDS, isValidPhaseId, validatePhases };
