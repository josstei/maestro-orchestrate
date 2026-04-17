'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
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
      'files',
    ]);
  });

  it('accepts a well-formed phase array', () => {
    const result = validatePhases([
      {
        id: 1,
        name: 'Scaffold',
        agent: 'coder',
        parallel: false,
        blocked_by: [],
        files: ['src/foo.js'],
      },
    ]);
    assert.deepEqual(result, { valid: true, violations: [] });
  });

  it('reports missing required fields with the offending phase id', () => {
    const result = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [], files: ['x'] },
      { id: 2, name: 'B', parallel: false, blocked_by: [], files: ['y'] },
    ]);
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].rule, 'missing_required_field');
    assert.equal(result.violations[0].phase_id, 2);
    assert.equal(result.violations[0].field, 'agent');
  });

  it('rejects non-string agent values', () => {
    const result = validatePhases([
      { id: 1, name: 'A', agent: 42, parallel: false, blocked_by: [], files: ['x'] },
    ]);
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].rule, 'invalid_field_type');
    assert.equal(result.violations[0].field, 'agent');
  });

  it('rejects non-integer phase ids', () => {
    const result = validatePhases([
      { id: '1', name: 'A', agent: 'coder', parallel: false, blocked_by: [], files: ['x'] },
    ]);
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].rule, 'invalid_field_type');
    assert.equal(result.violations[0].field, 'id');
  });

  it('requires files to be an array of non-empty strings', () => {
    const result = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [], files: [''] },
    ]);
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].rule, 'invalid_field_value');
    assert.equal(result.violations[0].field, 'files');
  });
});
