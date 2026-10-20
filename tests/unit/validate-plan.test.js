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
  name: `Phase ${String(id).replace(/^p(?=\d)/, '')}`,
  agent: 'architect',
  parallel: false,
  blocked_by: [],
  ...overrides,
});

/** Phases `p1` … `p<count>`, built with {@link phase} defaults. */
const sequentialPhases = (count) => Array.from({ length: count }, (_, i) => phase(`p${i + 1}`));

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

  it('reports an unknown agent that claims files before its capability mismatch, with a null capability', () => {
    const phases = [phase('p1', { agent: 'wizard', files: ['a.js'] })];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.deepEqual(result.violations, [
      {
        rule: 'unknown_agent',
        detail: 'Phase p1: unknown agent "wizard" (normalized: "wizard")',
        severity: 'error',
      },
      {
        rule: 'agent_capability_mismatch',
        detail:
          "Phase p1: agent 'wizard' (null) cannot deliver file-creating tasks. Use a write-capable agent (coder, data_engineer, etc.) or split into analysis + implementation phases.",
        severity: 'error',
      },
    ]);
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

  it('lets a read_write agent claim files', () => {
    const phases = [
      phase('p1', {
        name: 'Write docs',
        agent: 'technical-writer',
        files: ['docs/guide.md'],
        files_created: ['docs/faq.md'],
      }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });

  it('reports only the error, not the creation-name warning, when a read_only agent claims files', () => {
    const phases = [phase('p1', { name: 'Implement docs', files: ['a.md'] })];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.deepEqual(result.violations, [
      {
        rule: 'agent_capability_mismatch',
        detail:
          "Phase p1: agent 'architect' (read_only) cannot deliver file-creating tasks. Use a write-capable agent (coder, data_engineer, etc.) or split into analysis + implementation phases.",
        severity: 'error',
      },
    ]);
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

  it('names the phase whose walk reached the cycle, even when that phase is not on it', () => {
    const phases = [
      phase('X', { blocked_by: ['A'] }),
      phase('A', { blocked_by: ['B'] }),
      phase('B', { blocked_by: ['A'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.deepEqual(result.violations, [
      { rule: 'cyclic_dependency', detail: 'Cycle detected involving phase X', severity: 'error' },
    ]);
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

  it('keeps dangling blockers in depth_map at depth 0 but out of the batches', () => {
    const phases = [
      phase('p1', { blocked_by: ['ghost'] }),
      phase('p2', { blocked_by: ['p1', 'ghost'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.deepEqual(result.parallelization_profile, {
      total_phases: 2,
      depth_map: { p1: 1, ghost: 0, p2: 2 },
      batches: [
        { depth: 1, phase_ids: ['p1'] },
        { depth: 2, phase_ids: ['p2'] },
      ],
      max_batch_size: 1,
      parallel_eligible: 0,
      effective_batches: 2,
    });
  });

  it('reports -Infinity as the max_batch_size of an empty plan (null on the wire)', () => {
    const result = handleValidatePlan({ plan: { phases: [] }, task_complexity: 'simple' });
    assert.deepEqual(result.parallelization_profile, {
      total_phases: 0,
      depth_map: {},
      batches: [],
      max_batch_size: -Infinity,
      parallel_eligible: 0,
      effective_batches: 0,
    });
    assert.equal(JSON.parse(JSON.stringify(result)).parallelization_profile.max_batch_size, null);
  });
});

describe('handleValidatePlan — complete result', () => {
  it('runs every check and reports violations in check order with exact details', () => {
    const phases = [
      phase('p1', { agent: 'wizard', blocked_by: ['ghost'] }),
      // A duplicate id shadows the first phase in the dependency graph.
      phase('p1', { name: 'Implement docs', files: ['a.md'] }),
      phase('p2', { name: 'Implement API' }),
      phase('p3', { agent: 'coder', parallel: true, blocked_by: ['p1'], files: ['s.js'] }),
      phase('p4', { agent: 'coder', parallel: true, blocked_by: ['p1'], files: ['s.js'] }),
      phase('p5', { agent: 'tester', blocked_by: ['p1', 'p3'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });
    assert.deepEqual(result, {
      valid: false,
      violations: [
        { rule: 'phase_count', detail: 'medium tasks allow max 5 phases, got 6', severity: 'error' },
        { rule: 'duplicate_id', detail: 'Duplicate phase ID: p1', severity: 'error' },
        {
          rule: 'dangling_dependency',
          detail: 'Phase p1 references non-existent dependency: ghost',
          severity: 'error',
        },
        {
          rule: 'unknown_agent',
          detail: 'Phase p1: unknown agent "wizard" (normalized: "wizard")',
          severity: 'error',
        },
        {
          rule: 'agent_capability_mismatch',
          detail:
            "Phase p1: agent 'architect' (read_only) cannot deliver file-creating tasks. Use a write-capable agent (coder, data_engineer, etc.) or split into analysis + implementation phases.",
          severity: 'error',
        },
        {
          rule: 'agent_capability_mismatch',
          detail:
            "Phase p2: agent 'architect' (read_only) assigned to phase 'Implement API' which may require file creation. Verify this agent can deliver the phase's requirements.",
          severity: 'warning',
        },
        { rule: 'file_overlap', detail: 'Parallel phases p3 and p4 both touch "s.js"', severity: 'error' },
        {
          rule: 'redundant_dependency',
          detail: 'Phase p5: dependency on phase p1 is redundant (already reachable via phase p3)',
          severity: 'warning',
        },
      ],
      parallelization_profile: {
        total_phases: 6,
        depth_map: { p1: 0, p2: 0, p3: 1, p4: 1, p5: 2 },
        batches: [
          { depth: 0, phase_ids: ['p1', 'p1', 'p2'] },
          { depth: 1, phase_ids: ['p3', 'p4'] },
          { depth: 2, phase_ids: ['p5'] },
        ],
        max_batch_size: 3,
        parallel_eligible: 5,
        effective_batches: 3,
      },
    });
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

  it('reports field violations with their phase id and field, and no profile', () => {
    const result = handleValidatePlan({
      plan: {
        phases: [{ id: 'p1', name: '', agent: 'coder', parallel: 'no', blocked_by: [] }, {}],
      },
      task_complexity: 'simple',
    });
    const fieldViolation = (rule, phaseId, field) => ({
      rule,
      detail: `Phase ${phaseId ?? '?'} field "${field}" ${rule.replace('_', ' ')}`,
      severity: 'error',
      phase_id: phaseId,
      field,
    });
    assert.deepEqual(result, {
      valid: false,
      violations: [
        fieldViolation('invalid_field_type', 'p1', 'name'),
        fieldViolation('invalid_field_type', 'p1', 'parallel'),
        ...['id', 'name', 'agent', 'parallel', 'blocked_by'].map((field) =>
          fieldViolation('missing_required_field', null, field)
        ),
      ],
      parallelization_profile: null,
    });
    assert.equal(result.violations[0].detail, 'Phase p1 field "name" invalid field_type');
  });

  it('reports every required field missing for a phase that is not an object', () => {
    for (const notAnObject of [5, 'x', true]) {
      const result = handleValidatePlan({
        plan: { phases: [notAnObject, phase('p2')] },
        task_complexity: 'simple',
      });
      assert.equal(result.valid, false);
      assert.equal(result.parallelization_profile, null);
      assert.deepEqual(
        result.violations.map(({ rule, detail }) => [rule, detail]),
        ['id', 'name', 'agent', 'parallel', 'blocked_by'].map((field) => [
          'missing_required_field',
          `Phase ? field "${field}" missing required_field`,
        ])
      );
    }
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

describe('handleValidatePlan — ids, agents and files that are not plain map keys', () => {
  it('treats an integer id and the same id as a string as different phases', () => {
    const selfNamed = handleValidatePlan({
      plan: { phases: [phase(1, { blocked_by: ['1'] })] },
      task_complexity: 'simple',
    });
    assert.deepEqual(selfNamed.violations, [
      {
        rule: 'dangling_dependency',
        detail: 'Phase 1 references non-existent dependency: 1',
        severity: 'error',
      },
    ]);
    assert.deepEqual(Object.keys(selfNamed.parallelization_profile.depth_map), ['1']);
    assert.deepEqual(selfNamed.parallelization_profile.batches, [{ depth: 1, phase_ids: [1] }]);

    const chained = handleValidatePlan({
      plan: {
        phases: [
          phase(1),
          phase('1', { blocked_by: [1] }),
          phase(2, { blocked_by: ['1'] }),
        ],
      },
      task_complexity: 'simple',
    });
    assert.deepEqual(chained.violations, []);
    assert.deepEqual(chained.parallelization_profile.batches, [
      { depth: 0, phase_ids: [1] },
      { depth: 1, phase_ids: ['1'] },
      { depth: 2, phase_ids: [2] },
    ]);
  });

  it('walks phase ids named after Object.prototype members like any other id', () => {
    const constructorBlocker = handleValidatePlan({
      plan: {
        phases: [phase('constructor'), phase('B'), phase('C', { blocked_by: ['constructor', 'B'] })],
      },
      task_complexity: 'simple',
    });
    assert.deepEqual(constructorBlocker.violations, []);
    assert.deepEqual(constructorBlocker.parallelization_profile.depth_map, { constructor: 0, B: 0, C: 1 });

    const chain = handleValidatePlan({
      plan: {
        phases: [
          phase('toString'),
          phase('b', { blocked_by: ['toString'] }),
          phase('__proto__', { blocked_by: ['b'] }),
        ],
      },
      task_complexity: 'simple',
    });
    assert.deepEqual(chain.violations, []);
    assert.equal(
      JSON.stringify(chain.parallelization_profile.depth_map),
      '{"toString":0,"b":1,"__proto__":2}'
    );
    assert.deepEqual(
      chain.parallelization_profile.batches.map((batch) => batch.depth),
      [0, 1, 2]
    );
  });

  it('does not report an overlap for files named after Object.prototype members', () => {
    const phases = [
      phase('a', { agent: 'coder', parallel: true, files: ['constructor'] }),
      phase('b', { agent: 'coder', parallel: true, files: ['toString', '__proto__'] }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });

  it('ignores runtime file manifests that are not arrays', () => {
    const phases = [
      phase('a', { agent: 'coder', parallel: true, files_created: 'ab' }),
      phase('b', { agent: 'coder', parallel: true, files: ['a', 'b'], files_modified: 5 }),
      phase('c', { parallel: true, files_created: {} }),
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });

  it('reports agents named after Object.prototype members as unknown, with a null capability', () => {
    for (const agent of ['constructor', '__proto__']) {
      const phases = [phase('a', { agent, files: ['x.js'] })];
      const result = handleValidatePlan({ plan: { phases }, task_complexity: 'simple' });
      assert.deepEqual(
        result.violations.map(({ rule, detail }) => [rule, detail]),
        [
          ['unknown_agent', `Phase a: unknown agent "${agent}" (normalized: "${agent}")`],
          [
            'agent_capability_mismatch',
            `Phase a: agent '${agent}' (null) cannot deliver file-creating tasks. Use a write-capable agent (coder, data_engineer, etc.) or split into analysis + implementation phases.`,
          ],
        ]
      );
    }
  });
});
