import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runPlanValidation } from '../../src/mcp/validation/plan-validation-pipeline.js';
const emptyPlan = { phases: [] };

function rule(id, violations) {
  return { id, evaluate: () => violations };
}

describe('runPlanValidation — staging mechanics', () => {
  it('returns valid with a null profile when no stage builds one', () => {
    const stages = [{ id: 's', haltOnError: false, rules: [rule('noop', [])] }];
    const result = runPlanValidation(emptyPlan, 'simple', stages);
    assert.deepEqual(result, { valid: true, violations: [], parallelization_profile: null });
  });

  it('short-circuits a halt-on-error stage with a null profile', () => {
    const stages = [
      { id: 'gate', haltOnError: true, rules: [rule('boom', [{ rule: 'boom', severity: 'error' }])] },
      { id: 'depth', haltOnError: false, buildsProfile: true, rules: [rule('never', [{ rule: 'never', severity: 'error' }])] },
    ];
    const result = runPlanValidation(emptyPlan, 'simple', stages);
    assert.equal(result.valid, false);
    assert.deepEqual(result.violations, [{ rule: 'boom', severity: 'error' }]);
    assert.equal(result.parallelization_profile, null);
  });

  it('does not halt when a halt-on-error stage emits only warnings', () => {
    const stages = [
      { id: 'gate', haltOnError: true, rules: [rule('warn', [{ rule: 'warn', severity: 'warning' }])] },
    ];
    const result = runPlanValidation(emptyPlan, 'simple', stages);
    assert.equal(result.valid, true);
    assert.equal(result.violations.length, 1);
  });

  it('skips a stage whose guard returns false and suppresses its profile', () => {
    const stages = [
      { id: 'graph', haltOnError: false, rules: [rule('cyclic_dependency', [{ rule: 'cyclic_dependency', severity: 'error' }])] },
      {
        id: 'depth',
        haltOnError: false,
        buildsProfile: true,
        guard: (_c, violations) => !violations.some((v) => v.rule === 'cyclic_dependency'),
        rules: [rule('never', [{ rule: 'never', severity: 'error' }])],
      },
    ];
    const result = runPlanValidation(emptyPlan, 'simple', stages);
    assert.equal(result.valid, false);
    assert.deepEqual(result.violations, [{ rule: 'cyclic_dependency', severity: 'error' }]);
    assert.equal(result.parallelization_profile, null);
  });

  it('builds the profile when the buildsProfile stage runs', () => {
    const stages = [{ id: 'depth', haltOnError: false, buildsProfile: true, rules: [rule('noop', [])] }];
    const result = runPlanValidation({ phases: [] }, 'simple', stages);
    assert.notEqual(result.parallelization_profile, null);
    assert.equal(result.parallelization_profile.total_phases, 0);
  });

  it('valid is false when any violation is not a warning', () => {
    const stages = [
      { id: 's', haltOnError: false, rules: [rule('mix', [{ rule: 'a', severity: 'warning' }, { rule: 'b', severity: 'error' }])] },
    ];
    assert.equal(runPlanValidation(emptyPlan, 'simple', stages).valid, false);
  });
});
