'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { handleValidatePlan } = require('../../src/mcp/handlers/validate-plan');

describe('handleValidatePlan — plan structure validation', () => {
  it('returns invalid for null plan', () => {
    const result = handleValidatePlan({ plan: null, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'invalid_plan'));
  });

  it('returns invalid for undefined plan', () => {
    const result = handleValidatePlan({ plan: undefined, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'invalid_plan'));
  });

  it('returns invalid for plan without phases array', () => {
    const result = handleValidatePlan({ plan: { phases: 'not-an-array' }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'invalid_plan'));
  });

  it('returns valid for empty phases array', () => {
    const result = handleValidatePlan({ plan: { phases: [] }, task_complexity: 'simple' });
    assert.equal(result.valid, true);
    assert.equal(result.violations.length, 0);
  });
});

describe('handleValidatePlan — phase count limits', () => {
  it('returns valid for simple plan within 3-phase limit', () => {
    const phases = [
      { id: 'p1', name: 'Phase 1', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p2', name: 'Phase 2', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p3', name: 'Phase 3', agent: 'architect', parallel: false, blocked_by: [] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, true);
    assert.ok(!result.violations.some((v) => v.rule === 'phase_count'));
  });

  it('returns invalid when simple plan exceeds 3 phases', () => {
    const phases = [
      { id: 'p1', name: 'Phase 1', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p2', name: 'Phase 2', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p3', name: 'Phase 3', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p4', name: 'Phase 4', agent: 'architect', parallel: false, blocked_by: [] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'phase_count'));
  });

  it('returns invalid when medium plan exceeds 5 phases', () => {
    const phases = [
      { id: 'p1', name: 'Phase 1', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p2', name: 'Phase 2', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p3', name: 'Phase 3', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p4', name: 'Phase 4', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p5', name: 'Phase 5', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p6', name: 'Phase 6', agent: 'architect', parallel: false, blocked_by: [] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'phase_count'));
  });

  it('complex plans have no phase limit', () => {
    const phases = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Phase ${i + 1}`,
      agent: 'architect',
      parallel: false,
      blocked_by: [],
    }));
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'complex' });
    assert.ok(!result.violations.some((v) => v.rule === 'phase_count'));
  });
});

describe('handleValidatePlan — duplicate phase IDs', () => {
  it('detects duplicate phase IDs', () => {
    const phases = [
      { id: 'p1', name: 'Phase 1', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p1', name: 'Phase 1 duplicate', agent: 'architect', parallel: false, blocked_by: [] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'duplicate_id'));
  });
});

describe('handleValidatePlan — dangling dependencies', () => {
  it('detects dangling dependency references', () => {
    const phases = [
      { id: 'p1', name: 'Phase 1', agent: 'architect', parallel: false, blocked_by: ['nonexistent'] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'dangling_dependency'));
  });
});

describe('handleValidatePlan — agent validation', () => {
  it('detects unknown agent names', () => {
    const phases = [
      { id: 'p1', name: 'Phase 1', agent: 'totally-fake-agent', parallel: false, blocked_by: [] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'unknown_agent'));
  });

  it('accepts known agents in kebab-case by normalizing to snake_case', () => {
    const phases = [
      { id: 'p1', name: 'Review code', agent: 'code-reviewer', parallel: false, blocked_by: [] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.ok(!result.violations.some((v) => v.rule === 'unknown_agent'));
  });
});

describe('handleValidatePlan — agent capability mismatch', () => {
  it('detects read_only agent assigned to phase with files_created', () => {
    const phases = [
      {
        id: 'p1',
        name: 'Review code',
        agent: 'architect',
        parallel: false,
        blocked_by: [],
        files_created: ['src/new-file.js'],
      },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'agent_capability_mismatch' && v.severity === 'error'));
  });

  it('detects read_shell agent assigned to phase with files_modified', () => {
    const phases = [
      {
        id: 'p1',
        name: 'Debug issue',
        agent: 'debugger',
        parallel: false,
        blocked_by: [],
        files_modified: ['src/existing-file.js'],
      },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'agent_capability_mismatch' && v.severity === 'error'));
  });

  it('warns about read_only agent on phase with creation-signal name', () => {
    const phases = [
      {
        id: 'p1',
        name: 'Implement feature',
        agent: 'architect',
        parallel: false,
        blocked_by: [],
      },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.ok(
      result.violations.some(
        (v) => v.rule === 'agent_capability_mismatch' && v.severity === 'warning'
      )
    );
  });

  it('does not warn for read_only agent on non-creation phase name', () => {
    const phases = [
      {
        id: 'p1',
        name: 'Review code',
        agent: 'architect',
        parallel: false,
        blocked_by: [],
      },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.ok(!result.violations.some((v) => v.rule === 'agent_capability_mismatch'));
  });
});

describe('handleValidatePlan — cyclic dependencies', () => {
  it('detects direct cyclic dependencies (A blocked_by B, B blocked_by A)', () => {
    const phases = [
      { id: 'A', name: 'Phase A', agent: 'architect', parallel: false, blocked_by: ['B'] },
      { id: 'B', name: 'Phase B', agent: 'architect', parallel: false, blocked_by: ['A'] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'cyclic_dependency'));
  });

  it('detects multi-node cycles (A→B→C→A)', () => {
    const phases = [
      { id: 'A', name: 'Phase A', agent: 'architect', parallel: false, blocked_by: ['C'] },
      { id: 'B', name: 'Phase B', agent: 'architect', parallel: false, blocked_by: ['A'] },
      { id: 'C', name: 'Phase C', agent: 'architect', parallel: false, blocked_by: ['B'] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'cyclic_dependency'));
  });

  it('returns null parallelization_profile when cycles exist', () => {
    const phases = [
      { id: 'A', name: 'Phase A', agent: 'architect', parallel: false, blocked_by: ['B'] },
      { id: 'B', name: 'Phase B', agent: 'architect', parallel: false, blocked_by: ['A'] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.parallelization_profile, null);
  });
});

describe('handleValidatePlan — file overlap in parallel phases', () => {
  it('detects file overlaps in parallel phases at the same depth', () => {
    const phases = [
      {
        id: 'p1',
        name: 'Build module A',
        agent: 'coder',
        parallel: true,
        blocked_by: [],
        files_created: ['src/shared.js'],
      },
      {
        id: 'p2',
        name: 'Build module B',
        agent: 'coder',
        parallel: true,
        blocked_by: [],
        files_modified: ['src/shared.js'],
      },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'file_overlap'));
  });

  it('does not flag file overlap for non-parallel phases', () => {
    const phases = [
      {
        id: 'p1',
        name: 'Build module A',
        agent: 'coder',
        parallel: false,
        blocked_by: [],
        files_created: ['src/shared.js'],
      },
      {
        id: 'p2',
        name: 'Build module B',
        agent: 'coder',
        parallel: false,
        blocked_by: ['p1'],
        files_modified: ['src/shared.js'],
      },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.ok(!result.violations.some((v) => v.rule === 'file_overlap'));
  });
});

describe('handleValidatePlan — redundant dependencies', () => {
  it('detects redundant dependencies', () => {
    const phases = [
      { id: 'A', name: 'Phase A', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'B', name: 'Phase B', agent: 'architect', parallel: false, blocked_by: ['A'] },
      { id: 'C', name: 'Phase C', agent: 'architect', parallel: false, blocked_by: ['A', 'B'] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.ok(result.violations.some((v) => v.rule === 'redundant_dependency'));
  });
});

describe('handleValidatePlan — warnings-only validity', () => {
  it('returns valid when violations contain only warnings', () => {
    const phases = [
      {
        id: 'p1',
        name: 'Implement feature',
        agent: 'architect',
        parallel: false,
        blocked_by: [],
      },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, true);
    assert.ok(result.violations.every((v) => v.severity === 'warning'));
  });
});

describe('handleValidatePlan — parallelization profile', () => {
  it('returns correct parallelization profile with depths and batches', () => {
    const phases = [
      { id: 'p1', name: 'Phase 1', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p2', name: 'Phase 2', agent: 'architect', parallel: false, blocked_by: ['p1'] },
      { id: 'p3', name: 'Phase 3', agent: 'architect', parallel: false, blocked_by: ['p1'] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    const profile = result.parallelization_profile;

    assert.ok(profile !== null);
    assert.equal(profile.total_phases, 3);
    assert.equal(profile.depth_map['p1'], 0);
    assert.equal(profile.depth_map['p2'], 1);
    assert.equal(profile.depth_map['p3'], 1);
    assert.equal(profile.batches.length, 2);
    assert.equal(profile.batches[0].depth, 0);
    assert.deepEqual(profile.batches[0].phase_ids, ['p1']);
    assert.equal(profile.batches[1].depth, 1);
    assert.equal(profile.max_batch_size, 2);
    assert.equal(profile.effective_batches, 2);
  });

  it('parallelization profile includes correct parallel_eligible count', () => {
    const phases = [
      { id: 'p1', name: 'Phase 1', agent: 'architect', parallel: false, blocked_by: [] },
      { id: 'p2', name: 'Phase 2', agent: 'architect', parallel: false, blocked_by: ['p1'] },
      { id: 'p3', name: 'Phase 3', agent: 'architect', parallel: false, blocked_by: ['p1'] },
      { id: 'p4', name: 'Phase 4', agent: 'architect', parallel: false, blocked_by: ['p2', 'p3'] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'complex' });
    const profile = result.parallelization_profile;

    assert.ok(profile !== null);
    assert.equal(profile.parallel_eligible, 2);
  });
});

describe('handleValidatePlan with strict phase schema', () => {
  it('rejects a plan whose phase lacks required fields', () => {
    const result = handleValidatePlan({
      plan: {
        phases: [{ id: 'p1', name: 'Missing fields' }],
      },
      task_complexity: 'simple',
    });
    assert.equal(result.valid, false);
    const hasFieldViolation = result.violations.some(
      (v) => v.rule === 'missing_required_field'
    );
    assert.equal(hasFieldViolation, true);
  });

  it('accepts a plan with fully-populated phases', () => {
    const result = handleValidatePlan({
      plan: {
        phases: [
          {
            id: 'p1',
            name: 'Scaffold',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
          },
        ],
      },
      task_complexity: 'simple',
    });
    assert.equal(result.valid, true);
  });
});
