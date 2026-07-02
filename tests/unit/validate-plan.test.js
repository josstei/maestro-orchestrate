'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { handleValidatePlan } = require('../../src/mcp/handlers/validate-plan');

function makePhase(overrides = {}) {
  return { id: 'p1', name: 'Phase 1', agent: 'architect', parallel: false, blocked_by: [], ...overrides };
}

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
  const cases = [
    {
      name: 'returns valid for simple plan within 3-phase limit',
      count: 3,
      complexity: 'simple',
      expectValid: true,
      hasViolation: false,
    },
    {
      name: 'returns invalid when simple plan exceeds 3 phases',
      count: 4,
      complexity: 'simple',
      expectValid: false,
      hasViolation: true,
    },
    {
      name: 'returns invalid when medium plan exceeds 5 phases',
      count: 6,
      complexity: 'medium',
      expectValid: false,
      hasViolation: true,
    },
    {
      name: 'complex plans have no phase limit',
      count: 20,
      complexity: 'complex',
      expectValid: null,
      hasViolation: false,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const phases = Array.from({ length: c.count }, (_, i) =>
        makePhase({ id: `p${i + 1}`, name: `Phase ${i + 1}` })
      );
      const result = handleValidatePlan({ plan: { phases }, task_complexity: c.complexity });
      if (c.expectValid !== null) {
        assert.equal(result.valid, c.expectValid);
      }
      assert.equal(result.violations.some((v) => v.rule === 'phase_count'), c.hasViolation);
    });
  }
});

describe('handleValidatePlan — duplicate phase IDs', () => {
  it('detects duplicate phase IDs', () => {
    const phases = [
      makePhase({ id: 'p1' }),
      makePhase({ id: 'p1', name: 'Phase 1 duplicate' }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.rule === 'duplicate_id'));
  });
});

describe('handleValidatePlan — dangling dependencies', () => {
  it('detects dangling dependency references', () => {
    const phases = [makePhase({ blocked_by: ['nonexistent'] })];
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
  const cases = [
    {
      name: 'detects read_only agent assigned to phase with files_created',
      overrides: { name: 'Review code', agent: 'architect', files_created: ['src/new-file.js'] },
      expectValid: false,
      presence: 'error',
    },
    {
      name: 'detects read_shell agent assigned to phase with files_modified',
      overrides: { name: 'Debug issue', agent: 'debugger', files_modified: ['src/existing-file.js'] },
      expectValid: false,
      presence: 'error',
    },
    {
      name: 'warns about read_only agent on phase with creation-signal name',
      overrides: { name: 'Implement feature', agent: 'architect' },
      expectValid: null,
      presence: 'warning',
    },
    {
      name: 'does not warn for read_only agent on non-creation phase name',
      overrides: { name: 'Review code', agent: 'architect' },
      expectValid: null,
      presence: 'absent',
    },
    {
      name: 'detects read_only agent assigned to phase with planning-time files',
      overrides: { name: 'Audit module', agent: 'code-reviewer', files: ['src/app.js'] },
      expectValid: false,
      presence: 'error',
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const phases = [makePhase(c.overrides)];
      const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
      if (c.expectValid !== null) {
        assert.equal(result.valid, c.expectValid);
      }
      if (c.presence === 'absent') {
        assert.ok(!result.violations.some((v) => v.rule === 'agent_capability_mismatch'));
      } else {
        assert.ok(
          result.violations.some(
            (v) => v.rule === 'agent_capability_mismatch' && v.severity === c.presence
          )
        );
      }
    });
  }
});

describe('handleValidatePlan — cyclic dependencies', () => {
  const cases = [
    {
      name: 'detects direct cyclic dependencies (A blocked_by B, B blocked_by A)',
      phases: [
        makePhase({ id: 'A', name: 'Phase A', blocked_by: ['B'] }),
        makePhase({ id: 'B', name: 'Phase B', blocked_by: ['A'] }),
      ],
    },
    {
      name: 'detects multi-node cycles (A→B→C→A)',
      phases: [
        makePhase({ id: 'A', name: 'Phase A', blocked_by: ['C'] }),
        makePhase({ id: 'B', name: 'Phase B', blocked_by: ['A'] }),
        makePhase({ id: 'C', name: 'Phase C', blocked_by: ['B'] }),
      ],
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = handleValidatePlan({ plan: { phases: c.phases }, task_complexity: 'medium' });
      assert.equal(result.valid, false);
      assert.ok(result.violations.some((v) => v.rule === 'cyclic_dependency'));
    });
  }

  it('returns null parallelization_profile when cycles exist', () => {
    const phases = [
      makePhase({ id: 'A', name: 'Phase A', blocked_by: ['B'] }),
      makePhase({ id: 'B', name: 'Phase B', blocked_by: ['A'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.equal(result.parallelization_profile, null);
  });
});

describe('handleValidatePlan — file overlap in parallel phases', () => {
  const cases = [
    {
      name: 'detects file overlaps in parallel phases at the same depth',
      phases: [
        makePhase({
          id: 'p1',
          name: 'Build module A',
          agent: 'coder',
          parallel: true,
          files_created: ['src/shared.js'],
        }),
        makePhase({
          id: 'p2',
          name: 'Build module B',
          agent: 'coder',
          parallel: true,
          files_modified: ['src/shared.js'],
        }),
      ],
      expectValid: false,
      hasViolation: true,
    },
    {
      name: 'does not flag file overlap for non-parallel phases',
      phases: [
        makePhase({
          id: 'p1',
          name: 'Build module A',
          agent: 'coder',
          files_created: ['src/shared.js'],
        }),
        makePhase({
          id: 'p2',
          name: 'Build module B',
          agent: 'coder',
          blocked_by: ['p1'],
          files_modified: ['src/shared.js'],
        }),
      ],
      expectValid: null,
      hasViolation: false,
    },
    {
      name: 'detects file overlap when parallel phases declare the same planning-time files',
      phases: [
        makePhase({ id: 'p1', name: 'Build module A', agent: 'coder', parallel: true, files: ['src/app.js'] }),
        makePhase({ id: 'p2', name: 'Build module B', agent: 'coder', parallel: true, files: ['src/app.js'] }),
      ],
      expectValid: false,
      hasViolation: true,
    },
    {
      name: 'detects file overlap when one phase uses planning-time files and a sibling uses runtime manifests',
      phases: [
        makePhase({ id: 'p1', name: 'Build module A', agent: 'coder', parallel: true, files: ['src/app.js'] }),
        makePhase({
          id: 'p2',
          name: 'Build module B',
          agent: 'coder',
          parallel: true,
          files_created: ['src/app.js'],
        }),
      ],
      expectValid: false,
      hasViolation: true,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = handleValidatePlan({ plan: { phases: c.phases }, task_complexity: 'medium' });
      if (c.expectValid !== null) {
        assert.equal(result.valid, c.expectValid);
      }
      assert.equal(result.violations.some((v) => v.rule === 'file_overlap'), c.hasViolation);
    });
  }
});

describe('handleValidatePlan — redundant dependencies', () => {
  it('detects redundant dependencies', () => {
    const phases = [
      makePhase({ id: 'A', name: 'Phase A' }),
      makePhase({ id: 'B', name: 'Phase B', blocked_by: ['A'] }),
      makePhase({ id: 'C', name: 'Phase C', blocked_by: ['A', 'B'] }),
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
