import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_VALIDATION_STAGES, cycleFreeGuard } from '../../src/mcp/validation/rule-registry.js';

describe('PLAN_VALIDATION_STAGES', () => {
  it('declares the four stages in canonical order', () => {
    assert.deepEqual(
      PLAN_VALIDATION_STAGES.map((stage) => stage.id),
      ['structure', 'phase-schema', 'graph', 'dependency-depth']
    );
  });

  it('is frozen down to the rule arrays', () => {
    assert.equal(Object.isFrozen(PLAN_VALIDATION_STAGES), true);
    for (const stage of PLAN_VALIDATION_STAGES) {
      assert.equal(Object.isFrozen(stage), true);
      assert.equal(Object.isFrozen(stage.rules), true);
    }
  });

  it('every rule has a string id and a function evaluate', () => {
    for (const stage of PLAN_VALIDATION_STAGES) {
      for (const rule of stage.rules) {
        assert.equal(typeof rule.id, 'string');
        assert.equal(typeof rule.evaluate, 'function');
      }
    }
  });

  it('gates structure and phase-schema on halt-on-error', () => {
    const byId = new Map(PLAN_VALIDATION_STAGES.map((stage) => [stage.id, stage]));
    assert.equal(byId.get('structure').haltOnError, true);
    assert.equal(byId.get('phase-schema').haltOnError, true);
    assert.equal(byId.get('graph').haltOnError, false);
    assert.equal(byId.get('dependency-depth').haltOnError, false);
  });

  it('marks dependency-depth as the profile producer with a cycle guard', () => {
    const depth = PLAN_VALIDATION_STAGES.find((stage) => stage.id === 'dependency-depth');
    assert.equal(depth.buildsProfile, true);
    assert.equal(typeof depth.guard, 'function');
  });

  it('cycleFreeGuard blocks the depth stage when a cyclic_dependency violation is present', () => {
    assert.equal(cycleFreeGuard({}, []), true);
    assert.equal(cycleFreeGuard({}, [{ rule: 'file_overlap' }]), true);
    assert.equal(cycleFreeGuard({}, [{ rule: 'cyclic_dependency' }]), false);
  });

  it('registers the full canonical rule set, once each, in pipeline order', () => {
    const ids = PLAN_VALIDATION_STAGES.flatMap((stage) => stage.rules.map((rule) => rule.id));
    assert.deepEqual(ids, [
      'plan_shape',
      'phase_field_schema',
      'phase_count',
      'duplicate_id',
      'dangling_dependency',
      'unknown_agent',
      'agent_capability',
      'cyclic_dependency',
      'file_overlap',
      'redundant_dependency',
    ]);
  });
});
