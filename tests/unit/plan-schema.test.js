'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  PHASE_ID_SCHEMA,
  PHASE_ITEM_SCHEMA,
  PHASE_REQUIRED_FIELDS,
  validatePhases,
} = require('../../src/mcp/contracts/plan-schema');

describe('plan-schema', () => {
  it('exposes the required field list in declaration order', () => {
    assert.deepEqual(PHASE_REQUIRED_FIELDS, [
      'id',
      'name',
      'agent',
      'parallel',
      'blocked_by',
    ]);
  });

  it('accepts a well-formed phase with integer id', () => {
    const result = validatePhases([
      {
        id: 1,
        name: 'Scaffold',
        agent: 'coder',
        parallel: false,
        blocked_by: [],
      },
    ]);
    assert.deepEqual(result, { valid: true, violations: [] });
  });

  it('accepts a well-formed phase with string id and string blocked_by references', () => {
    const result = validatePhases([
      { id: 'p1', name: 'A', agent: 'coder', parallel: false, blocked_by: [] },
      { id: 'p2', name: 'B', agent: 'coder', parallel: false, blocked_by: ['p1'] },
    ]);
    assert.deepEqual(result, { valid: true, violations: [] });
  });

  it('reports missing required fields with the offending phase id', () => {
    const result = validatePhases([
      { id: 'p1', name: 'A', agent: 'coder', parallel: false, blocked_by: [] },
      { id: 'p2', name: 'B', parallel: false, blocked_by: [] },
    ]);
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].rule, 'missing_required_field');
    assert.equal(result.violations[0].phase_id, 'p2');
    assert.equal(result.violations[0].field, 'agent');
  });

  it('rejects non-string agent values', () => {
    const result = validatePhases([
      { id: 'p1', name: 'A', agent: 42, parallel: false, blocked_by: [] },
    ]);
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].rule, 'invalid_field_type');
    assert.equal(result.violations[0].field, 'agent');
  });

  it('rejects phase ids that are neither string nor positive integer', () => {
    const result = validatePhases([
      { id: {}, name: 'A', agent: 'coder', parallel: false, blocked_by: [] },
    ]);
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].rule, 'invalid_field_type');
    assert.equal(result.violations[0].field, 'id');
  });

  it('rejects blocked_by items that are neither string nor integer', () => {
    const result = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [null] },
    ]);
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].rule, 'invalid_field_type');
    assert.equal(result.violations[0].field, 'blocked_by');
  });

  it('treats files as optional but validates its shape when present', () => {
    const withEmpty = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [], files: [''] },
    ]);
    assert.equal(withEmpty.valid, false);
    assert.equal(withEmpty.violations[0].rule, 'invalid_field_value');
    assert.equal(withEmpty.violations[0].field, 'files');

    const withoutFiles = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [] },
    ]);
    assert.equal(withoutFiles.valid, true);
  });
});
