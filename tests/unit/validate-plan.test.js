'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { handleValidatePlan } = require('../../src/mcp/handlers/validate-plan');

/**
 * A sequential architect phase with no dependencies. `name` defaults to
 * `Phase <n>` for id `p<n>` and to `Phase <id>` otherwise.
 */
const phase = (id, overrides = {}) => ({
  id,
  name: `Phase ${id.replace(/^p(?=\d)/, '')}`,
  agent: 'architect',
  parallel: false,
  blocked_by: [],
  ...overrides,
});

/** Phases `p1` … `p<count>`, built with {@link phase} defaults. */
const sequentialPhases = (count) => Array.from({ length: count }, (_, i) => phase(`p${i + 1}`));

it('preserves diagnostic order across structural constraints, agents, and cycles', () => {
  const result = handleValidatePlan({
    task_complexity: 'simple',
    plan: { phases: [
      phase('p1', { blocked_by: ['missing'], agent: 'unknown' }),
      phase('p1', { blocked_by: ['p3'] }),
      phase('p3', { blocked_by: ['p1'], files: ['result.txt'] }),
      phase('p4'),
    ] },
  });
  assert.deepEqual(result.violations.map(({ rule }) => rule), [
    'phase_count', 'duplicate_id', 'dangling_dependency', 'unknown_agent',
    'agent_capability_mismatch', 'cyclic_dependency',
  ]);
  assert.equal(result.parallelization_profile, null);
});

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
    const phases = sequentialPhases(3);
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, true);
    assert.ok(!result.violations.some((v) => v.rule === 'phase_count'));
  });

  it('returns invalid when simple plan exceeds 3 phases', () => {
    const phases = sequentialPhases(4);
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'phase_count'));
  });

  it('returns invalid when medium plan exceeds 5 phases', () => {
    const phases = sequentialPhases(6);
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'phase_count'));
  });

  it('complex plans have no phase limit', () => {
    const phases = sequentialPhases(20);
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'complex' });
    assert.ok(!result.violations.some((v) => v.rule === 'phase_count'));
  });
});

describe('handleValidatePlan — duplicate phase IDs', () => {
  it('detects duplicate phase IDs', () => {
    const phases = [
      phase('p1'),
      phase('p1', { name: 'Phase 1 duplicate' }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'duplicate_id'));
  });
});

describe('handleValidatePlan — dangling dependencies', () => {
  it('detects dangling dependency references', () => {
    const phases = [phase('p1', { blocked_by: ['nonexistent'] })];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'dangling_dependency'));
  });
});

describe('handleValidatePlan — agent validation', () => {
  it('detects unknown agent names', () => {
    const phases = [phase('p1', { agent: 'totally-fake-agent' })];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'unknown_agent'));
  });

  it('accepts known agents in kebab-case by normalizing to snake_case', () => {
    const phases = [phase('p1', { name: 'Review code', agent: 'code-reviewer' })];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.ok(!result.violations.some((v) => v.rule === 'unknown_agent'));
  });
});

describe('handleValidatePlan — agent capability mismatch', () => {
  it('detects read_only agent assigned to phase with files_created', () => {
    const phases = [phase('p1', { name: 'Review code', files_created: ['src/new-file.js'] })];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'agent_capability_mismatch' && v.severity === 'error'));
  });

  it('detects read_shell agent assigned to phase with files_modified', () => {
    const phases = [
      phase('p1', {
        name: 'Debug issue',
        agent: 'debugger',
        files_modified: ['src/existing-file.js'],
      }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'agent_capability_mismatch' && v.severity === 'error'));
  });

  it('warns about read_only agent on phase with creation-signal name', () => {
    const phases = [phase('p1', { name: 'Implement feature' })];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.ok(
      result.violations.some(
        (v) => v.rule === 'agent_capability_mismatch' && v.severity === 'warning'
      )
    );
  });

  it('does not warn for read_only agent on non-creation phase name', () => {
    const phases = [phase('p1', { name: 'Review code' })];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.ok(!result.violations.some((v) => v.rule === 'agent_capability_mismatch'));
  });

  it('detects read_only agent assigned to phase with planning-time files', () => {
    const phases = [
      phase('p1', {
        name: 'Audit module',
        agent: 'code-reviewer',
        files: ['src/app.js'],
      }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, false);
    assert.ok(
      result.violations.some(
        (v) => v.rule === 'agent_capability_mismatch' && v.severity === 'error'
      )
    );
  });
});

describe('handleValidatePlan — cyclic dependencies', () => {
  it('detects direct cyclic dependencies (A blocked_by B, B blocked_by A)', () => {
    const phases = [
      phase('A', { blocked_by: ['B'] }),
      phase('B', { blocked_by: ['A'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'cyclic_dependency'));
  });

  it('detects multi-node cycles (A→B→C→A)', () => {
    const phases = [
      phase('A', { blocked_by: ['C'] }),
      phase('B', { blocked_by: ['A'] }),
      phase('C', { blocked_by: ['B'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'cyclic_dependency'));
  });

  it('returns null parallelization_profile when cycles exist', () => {
    const phases = [
      phase('A', { blocked_by: ['B'] }),
      phase('B', { blocked_by: ['A'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.parallelization_profile, null);
  });
});

describe('handleValidatePlan — file overlap in parallel phases', () => {
  const buildModule = (id, letter, overrides) =>
    phase(id, { name: `Build module ${letter}`, agent: 'coder', parallel: true, ...overrides });

  it('detects file overlaps in parallel phases at the same depth', () => {
    const phases = [
      buildModule('p1', 'A', { files_created: ['src/shared.js'] }),
      buildModule('p2', 'B', { files_modified: ['src/shared.js'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'file_overlap'));
  });

  it('does not flag file overlap for non-parallel phases', () => {
    const phases = [
      buildModule('p1', 'A', { parallel: false, files_created: ['src/shared.js'] }),
      buildModule('p2', 'B', { parallel: false, blocked_by: ['p1'], files_modified: ['src/shared.js'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.ok(!result.violations.some((v) => v.rule === 'file_overlap'));
  });

  it('detects file overlap when parallel phases declare the same planning-time files', () => {
    const phases = [
      buildModule('p1', 'A', { files: ['src/app.js'] }),
      buildModule('p2', 'B', { files: ['src/app.js'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'file_overlap'));
  });

  it('detects file overlap when one phase uses planning-time files and a sibling uses runtime manifests', () => {
    const phases = [
      buildModule('p1', 'A', { files: ['src/app.js'] }),
      buildModule('p2', 'B', { files_created: ['src/app.js'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'file_overlap'));
  });
});

describe('handleValidatePlan — redundant dependencies', () => {
  it('detects redundant dependencies', () => {
    const phases = [
      phase('A'),
      phase('B', { blocked_by: ['A'] }),
      phase('C', { blocked_by: ['A', 'B'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.ok(result.violations.some((v) => v.rule === 'redundant_dependency'));
  });
});

describe('handleValidatePlan — warnings-only validity', () => {
  it('returns valid when violations contain only warnings', () => {
    const phases = [phase('p1', { name: 'Implement feature' })];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, true);
    assert.ok(result.violations.every((v) => v.severity === 'warning'));
  });
});

describe('handleValidatePlan — parallelization profile', () => {
  it('returns correct parallelization profile with depths and batches', () => {
    const phases = [
      phase('p1'),
      phase('p2', { blocked_by: ['p1'] }),
      phase('p3', { blocked_by: ['p1'] }),
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
      phase('p1'),
      phase('p2', { blocked_by: ['p1'] }),
      phase('p3', { blocked_by: ['p1'] }),
      phase('p4', { blocked_by: ['p2', 'p3'] }),
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
