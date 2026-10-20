'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { PHASE_ITEM_SCHEMA, validatePhases } = require('../../src/mcp/contracts/plan-schema');

const missing = (field, phaseId = null) => ({
  rule: 'missing_required_field',
  phase_id: phaseId,
  field,
  severity: 'error',
});

describe('plan-schema', () => {
  it('lists the phase fields, then the required ones, in declaration order', () => {
    assert.deepEqual(Object.keys(PHASE_ITEM_SCHEMA), ['type', 'properties', 'required', 'additionalProperties']);
    assert.deepEqual(Object.keys(PHASE_ITEM_SCHEMA.properties), [
      'id',
      'name',
      'agent',
      'parallel',
      'blocked_by',
      'files',
    ]);
    assert.deepEqual(PHASE_ITEM_SCHEMA.required, ['id', 'name', 'agent', 'parallel', 'blocked_by']);
  });

  it('accepts a well-formed phase with integer id', () => {
    const violations = validatePhases([
      {
        id: 1,
        name: 'Scaffold',
        agent: 'coder',
        parallel: false,
        blocked_by: [],
      },
    ]);
    assert.deepEqual(violations, []);
  });

  it('accepts a well-formed phase with string id and string blocked_by references', () => {
    const violations = validatePhases([
      { id: 'p1', name: 'A', agent: 'coder', parallel: false, blocked_by: [] },
      { id: 'p2', name: 'B', agent: 'coder', parallel: false, blocked_by: ['p1'] },
    ]);
    assert.deepEqual(violations, []);
  });

  it('reports a non-array phases value as invalid_phases', () => {
    assert.deepEqual(validatePhases('nope'), [
      { rule: 'invalid_phases', detail: 'phases must be an array', severity: 'error' },
    ]);
  });

  it('reports missing required fields with the offending phase id', () => {
    const violations = validatePhases([
      { id: 'p1', name: 'A', agent: 'coder', parallel: false, blocked_by: [] },
      { id: 'p2', name: 'B', parallel: false, blocked_by: [] },
    ]);
    assert.deepEqual(violations, [missing('agent', 'p2')]);
  });

  it("reports a phase's missing fields before its invalid ones", () => {
    const violations = validatePhases([{ id: 'p1', name: '', agent: 'coder' }]);
    assert.deepEqual(
      violations.map(({ rule, field }) => [rule, field]),
      [
        ['missing_required_field', 'parallel'],
        ['missing_required_field', 'blocked_by'],
        ['invalid_field_type', 'name'],
      ]
    );
  });

  it('reports every field missing for null and primitive phases', () => {
    const allMissing = PHASE_ITEM_SCHEMA.required.map((field) => missing(field));
    assert.deepEqual(validatePhases([null]), allMissing);
    assert.deepEqual(validatePhases([5]), allMissing);
    assert.deepEqual(validatePhases(['x']), allMissing);
    assert.deepEqual(validatePhases([true]), allMissing);
  });

  it('rejects non-string agent values', () => {
    const violations = validatePhases([
      { id: 'p1', name: 'A', agent: 42, parallel: false, blocked_by: [] },
    ]);
    assert.equal(violations[0].rule, 'invalid_field_type');
    assert.equal(violations[0].field, 'agent');
  });

  it('rejects phase ids that are neither string nor positive integer', () => {
    const violations = validatePhases([
      { id: {}, name: 'A', agent: 'coder', parallel: false, blocked_by: [] },
    ]);
    assert.equal(violations[0].rule, 'invalid_field_type');
    assert.equal(violations[0].field, 'id');
  });

  it('rejects blocked_by items that are neither string nor integer', () => {
    const violations = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [null] },
    ]);
    assert.equal(violations[0].rule, 'invalid_field_type');
    assert.equal(violations[0].field, 'blocked_by');
  });

  it('rejects blocked_by items that are non-positive integers', () => {
    const zero = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [0] },
    ]);
    assert.equal(zero[0].rule, 'invalid_field_type');
    assert.equal(zero[0].field, 'blocked_by');

    const negative = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [-1] },
    ]);
    assert.equal(negative[0].field, 'blocked_by');
  });

  it('treats files as optional but validates its shape when present', () => {
    const withEmpty = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [], files: [''] },
    ]);
    assert.equal(withEmpty[0].rule, 'invalid_field_value');
    assert.equal(withEmpty[0].field, 'files');

    const withoutFiles = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [] },
    ]);
    assert.deepEqual(withoutFiles, []);
  });
});
