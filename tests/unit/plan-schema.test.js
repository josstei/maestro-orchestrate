import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE_REQUIRED_FIELDS,
  PlanPhaseIdSchema,
  PlanPhaseSchema,
  PlanSchema,
  WirePhaseIdSchema,
  validatePhases,
} from '../../dist/src/mcp/contracts/plan-schema.js';
import { checkPhaseFieldSchema } from '../../dist/src/mcp/validation/schema-checker.js';

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

  it('keeps wire IDs tolerant while refining IDs used by plans', () => {
    assert.equal(WirePhaseIdSchema.parse(0), 0);
    assert.equal(WirePhaseIdSchema.parse(''), '');
    assert.throws(() => PlanPhaseIdSchema.parse(0));
    assert.throws(() => PlanPhaseIdSchema.parse(''));
  });

  it('retains unknown plan and phase keys', () => {
    const result = PlanSchema.parse({
      plan_extension: { owner: 'planner' },
      phases: [{
        id: 'p1',
        name: 'A',
        agent: 'coder',
        parallel: false,
        blocked_by: [],
        phase_extension: 'kept',
      }],
    });

    assert.deepEqual(result.plan_extension, { owner: 'planner' });
    assert.equal(result.phases[0].phase_extension, 'kept');
    assert.equal(PlanPhaseSchema.parse(result.phases[0]).phase_extension, 'kept');
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

  it('rejects blocked_by items that are non-positive integers', () => {
    const zero = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [0] },
    ]);
    assert.equal(zero.valid, false);
    assert.equal(zero.violations[0].rule, 'invalid_field_type');
    assert.equal(zero.violations[0].field, 'blocked_by');

    const negative = validatePhases([
      { id: 1, name: 'A', agent: 'coder', parallel: false, blocked_by: [-1] },
    ]);
    assert.equal(negative.valid, false);
    assert.equal(negative.violations[0].field, 'blocked_by');
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

  it('preserves missing-field-first violation ordering and identifiers', () => {
    const result = validatePhases([{
      id: 0,
      name: '',
      parallel: 'no',
      blocked_by: [0],
      files: [''],
      future_extension: true,
    }]);

    assert.deepEqual(
      result.violations.map(({ rule, field, phase_id }) => ({ rule, field, phase_id })),
      [
        { rule: 'missing_required_field', field: 'agent', phase_id: 0 },
        { rule: 'invalid_field_type', field: 'id', phase_id: 0 },
        { rule: 'invalid_field_type', field: 'name', phase_id: 0 },
        { rule: 'invalid_field_type', field: 'parallel', phase_id: 0 },
        { rule: 'invalid_field_type', field: 'blocked_by', phase_id: 0 },
        { rule: 'invalid_field_value', field: 'files', phase_id: 0 },
      ]
    );
  });

  it('continues to reject an explicitly present undefined files field', () => {
    const result = validatePhases([{
      id: 1,
      name: 'A',
      agent: 'coder',
      parallel: false,
      blocked_by: [],
      files: undefined,
    }]);

    assert.equal(result.valid, false);
    assert.equal(result.violations[0].rule, 'invalid_field_value');
    assert.equal(result.violations[0].field, 'files');
  });

  it('maps phase contract violations into schema-checker violations', () => {
    const phases = [{ id: 1, name: 'P', parallel: false, blocked_by: [] }];
    const result = validatePhases(phases);
    const violations = checkPhaseFieldSchema(phases);

    assert.equal(result.valid, false);
    assert.equal(violations.length, result.violations.length);
    assert.ok(
      violations.some((violation) => (
        violation.rule === 'missing_required_field' && violation.field === 'agent'
      ))
    );
  });
});
