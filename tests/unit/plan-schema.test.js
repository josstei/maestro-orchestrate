'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  PHASE_ITEM_SCHEMA,
  validatePhases,
} = require('../../src/mcp/contracts/plan-schema');

/** A well-formed sequential coder phase. */
const phase = (id, overrides = {}) => ({
  id, name: 'A', agent: 'coder', parallel: false, blocked_by: [], ...overrides,
});

describe('plan-schema', () => {
  it('declares required fields in schema order', () => {
    assert.deepEqual(PHASE_ITEM_SCHEMA.required, [
      'id',
      'name',
      'agent',
      'parallel',
      'blocked_by',
    ]);
  });

  // Each row lists the expected violations as [rule, phase_id, field]; none means valid.
  for (const [name, phases, expected = []] of [
    ['accepts a well-formed phase with integer id and no files', [phase(1)]],
    ['accepts a well-formed phase with string id and string blocked_by references',
      [phase('p1'), phase('p2', { blocked_by: ['p1'] })]],
    ['reports missing required fields with the offending phase id',
      [phase('p1'), { id: 'p2', name: 'B', parallel: false, blocked_by: [] }],
      [['missing_required_field', 'p2', 'agent']]],
    ['reports missing fields before invalid values in contract order',
      [{ id: 0, name: '', parallel: null, files: [false] }], [
        ['missing_required_field', 0, 'agent'],
        ['missing_required_field', 0, 'blocked_by'],
        ['invalid_field_type', 0, 'id'],
        ['invalid_field_type', 0, 'name'],
        ['invalid_field_type', 0, 'parallel'],
        ['invalid_field_value', 0, 'files'],
      ]],
    ['rejects non-string agent values', [phase(1, { agent: 42 })], [['invalid_field_type', 1, 'agent']]],
    ['rejects phase ids that are neither string nor positive integer', [phase({})], [['invalid_field_type', {}, 'id']]],
    ['rejects blocked_by items that are neither string nor integer',
      [phase(1, { blocked_by: [null] })], [['invalid_field_type', 1, 'blocked_by']]],
    ['rejects zero blocked_by items', [phase(1, { blocked_by: [0] })], [['invalid_field_type', 1, 'blocked_by']]],
    ['rejects negative blocked_by items', [phase(1, { blocked_by: [-1] })], [['invalid_field_type', 1, 'blocked_by']]],
    ['validates the shape of files when present', [phase(1, { files: [''] })], [['invalid_field_value', 1, 'files']]],
  ]) {
    it(name, () => {
      const violations = expected.map(([rule, phase_id, field]) => ({ rule, phase_id, field, severity: 'error' }));
      assert.deepEqual(validatePhases(phases), { valid: violations.length === 0, violations });
    });
  }
});
