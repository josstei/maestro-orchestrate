'use strict';

const PHASE_REQUIRED_FIELDS = ['id', 'name', 'agent', 'parallel', 'blocked_by', 'files'];

const PHASE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 1 },
    agent: { type: 'string', minLength: 1 },
    parallel: { type: 'boolean' },
    blocked_by: { type: 'array', items: { type: 'integer' } },
    files: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
  required: PHASE_REQUIRED_FIELDS,
  additionalProperties: true,
};

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validates an array of phase objects against the canonical phase schema.
 * Returns a result object with `valid` boolean and `violations` array.
 * Each violation includes `rule`, `phase_id`, and `field` (where applicable).
 */
function validatePhases(phases) {
  const violations = [];
  if (!Array.isArray(phases)) {
    return {
      valid: false,
      violations: [{ rule: 'invalid_phases', detail: 'phases must be an array' }],
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
        });
      }
    }

    if (!phase) continue;

    if ('id' in phase && (!Number.isInteger(phase.id) || phase.id < 1)) {
      violations.push({ rule: 'invalid_field_type', phase_id: phaseId ?? null, field: 'id' });
    }
    if ('name' in phase && !isNonEmptyString(phase.name)) {
      violations.push({ rule: 'invalid_field_type', phase_id: phaseId ?? null, field: 'name' });
    }
    if ('agent' in phase && !isNonEmptyString(phase.agent)) {
      violations.push({ rule: 'invalid_field_type', phase_id: phaseId ?? null, field: 'agent' });
    }
    if ('parallel' in phase && typeof phase.parallel !== 'boolean') {
      violations.push({
        rule: 'invalid_field_type',
        phase_id: phaseId ?? null,
        field: 'parallel',
      });
    }
    if ('blocked_by' in phase) {
      if (
        !Array.isArray(phase.blocked_by) ||
        !phase.blocked_by.every((id) => Number.isInteger(id))
      ) {
        violations.push({
          rule: 'invalid_field_type',
          phase_id: phaseId ?? null,
          field: 'blocked_by',
        });
      }
    }
    if ('files' in phase) {
      if (!Array.isArray(phase.files) || !phase.files.every(isNonEmptyString)) {
        violations.push({
          rule: 'invalid_field_value',
          phase_id: phaseId ?? null,
          field: 'files',
        });
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

module.exports = { PHASE_ITEM_SCHEMA, PHASE_REQUIRED_FIELDS, validatePhases };
