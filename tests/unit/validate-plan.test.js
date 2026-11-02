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
const buildModule = (id, letter, overrides) =>
  phase(id, { name: `Build module ${letter}`, agent: 'coder', parallel: true, ...overrides });
/** An array `plan` is shorthand for `{ phases: plan }`. */
const validate = (plan, taskComplexity) =>
  handleValidatePlan({ plan: Array.isArray(plan) ? { phases: plan } : plan, task_complexity: taskComplexity });

it('preserves diagnostic order across structural constraints, agents, and cycles', () => {
  const result = validate([
    phase('p1', { blocked_by: ['missing'], agent: 'unknown' }),
    phase('p1', { blocked_by: ['p3'] }),
    phase('p3', { blocked_by: ['p1'], files: ['result.txt'] }),
    phase('p4'),
  ], 'simple');
  assert.deepEqual(result.violations.map(({ rule }) => rule), [
    'phase_count', 'duplicate_id', 'dangling_dependency', 'unknown_agent',
    'agent_capability_mismatch', 'cyclic_dependency',
  ]);
  // The plan passes the structure checks, so only its cycle withholds the profile.
  assert.equal(result.parallelization_profile, null);
});

// [title, task_complexity, plan, expected valid (null: unchecked), rule, whether some violation
// has that rule (and severity, when given)]
const RULE_CASES = [
  ['returns invalid for null plan', 'simple', null, false, 'invalid_plan', true],
  ['returns invalid for undefined plan', 'simple', undefined, false, 'invalid_plan', true],
  ['returns invalid for plan without phases array', 'simple', { phases: 'not-an-array' }, false, 'invalid_plan', true],
  ['rejects a plan whose phase lacks required fields', 'simple',
    { phases: [{ id: 'p1', name: 'Missing fields' }] }, false, 'missing_required_field', true],
  ['accepts a plan with fully-populated phases', 'simple',
    [phase('p1', { name: 'Scaffold', agent: 'coder' })], true, 'missing_required_field', false],
  ['returns valid for simple plan within 3-phase limit', 'simple', sequentialPhases(3), true, 'phase_count', false],
  ['returns invalid when simple plan exceeds 3 phases', 'simple', sequentialPhases(4), false, 'phase_count', true],
  ['returns invalid when medium plan exceeds 5 phases', 'medium', sequentialPhases(6), false, 'phase_count', true],
  ['complex plans have no phase limit', 'complex', sequentialPhases(20), null, 'phase_count', false],
  ['detects duplicate phase IDs', 'medium',
    [phase('p1'), phase('p1', { name: 'Phase 1 duplicate' })], false, 'duplicate_id', true],
  ['detects dangling dependency references', 'simple',
    [phase('p1', { blocked_by: ['nonexistent'] })], false, 'dangling_dependency', true],
  ['detects unknown agent names', 'simple',
    [phase('p1', { agent: 'totally-fake-agent' })], false, 'unknown_agent', true],
  ['accepts known agents in kebab-case by normalizing to snake_case', 'simple',
    [phase('p1', { name: 'Review code', agent: 'code-reviewer' })], null, 'unknown_agent', false],
  ['detects read_only agent assigned to phase with files_created', 'simple',
    [phase('p1', { name: 'Review code', files_created: ['src/new-file.js'] })],
    false, 'agent_capability_mismatch', true, 'error'],
  ['detects read_shell agent assigned to phase with files_modified', 'simple',
    [phase('p1', { name: 'Debug issue', agent: 'debugger', files_modified: ['src/existing-file.js'] })],
    false, 'agent_capability_mismatch', true, 'error'],
  ['detects read_only agent assigned to phase with planning-time files', 'simple',
    [phase('p1', { name: 'Audit module', agent: 'code-reviewer', files: ['src/app.js'] })],
    false, 'agent_capability_mismatch', true, 'error'],
  ['accepts read_write and full agents on file-touching phases', 'medium', [
    phase('p1', { agent: 'technical-writer', files: ['a.md'] }),
    phase('p2', { agent: 'coder', files_created: ['b.js'] }),
  ], null, 'agent_capability_mismatch', false],
  ['treats an unknown agent on a file-touching phase as not write-capable', 'simple',
    [phase('p1', { agent: 'fake-agent', files: ['a.js'] })], false, 'agent_capability_mismatch', true, 'error'],
  ['warns about read_only agent on phase with creation-signal name', 'simple',
    [phase('p1', { name: 'Implement feature' })], null, 'agent_capability_mismatch', true, 'warning'],
  ['does not warn for read_only agent on non-creation phase name', 'simple',
    [phase('p1', { name: 'Review code' })], null, 'agent_capability_mismatch', false],
  ['detects direct cyclic dependencies (A blocked_by B, B blocked_by A)', 'medium',
    [phase('A', { blocked_by: ['B'] }), phase('B', { blocked_by: ['A'] })], false, 'cyclic_dependency', true],
  ['detects multi-node cycles (A→B→C→A)', 'medium',
    [phase('A', { blocked_by: ['C'] }), phase('B', { blocked_by: ['A'] }), phase('C', { blocked_by: ['B'] })],
    false, 'cyclic_dependency', true],
  ['detects file overlaps in parallel phases at the same depth', 'medium', [
    buildModule('p1', 'A', { files_created: ['src/shared.js'] }),
    buildModule('p2', 'B', { files_modified: ['src/shared.js'] }),
  ], false, 'file_overlap', true],
  ['does not flag file overlap for non-parallel phases', 'medium', [
    buildModule('p1', 'A', { parallel: false, files_created: ['src/shared.js'] }),
    buildModule('p2', 'B', { parallel: false, blocked_by: ['p1'], files_modified: ['src/shared.js'] }),
  ], null, 'file_overlap', false],
  ['detects file overlap when parallel phases declare the same planning-time files', 'medium', [
    buildModule('p1', 'A', { files: ['src/app.js'] }),
    buildModule('p2', 'B', { files: ['src/app.js'] }),
  ], false, 'file_overlap', true],
  ['detects file overlap when one phase uses planning-time files and a sibling uses runtime manifests', 'medium', [
    buildModule('p1', 'A', { files: ['src/app.js'] }),
    buildModule('p2', 'B', { files_created: ['src/app.js'] }),
  ], false, 'file_overlap', true],
  ['detects redundant dependencies', 'medium',
    [phase('A'), phase('B', { blocked_by: ['A'] }), phase('C', { blocked_by: ['A', 'B'] })],
    null, 'redundant_dependency', true],
];

describe('handleValidatePlan', () => {
  for (const [title, taskComplexity, plan, valid, rule, present, severity] of RULE_CASES) {
    it(title, () => {
      const result = validate(plan, taskComplexity);
      if (valid !== null) assert.equal(result.valid, valid);
      assert.equal(result.violations.some((v) => v.rule === rule && (!severity || v.severity === severity)), present);
    });
  }

  it('returns valid for empty phases array', () => {
    const { valid, violations } = validate([], 'simple');
    assert.deepEqual({ valid, violations }, { valid: true, violations: [] });
  });

  it('returns valid when violations contain only warnings', () => {
    const result = validate([phase('p1', { name: 'Implement feature' })], 'simple');
    assert.equal(result.valid, true);
    assert.ok(result.violations.every((v) => v.severity === 'warning'));
  });

  it('returns the parallelization profile with depths, batches and parallel_eligible count', () => {
    const phases = [
      phase('p1'),
      phase('p2', { blocked_by: ['p1'] }),
      phase('p3', { blocked_by: ['p1'] }),
      phase('p4', { blocked_by: ['p2', 'p3'] }),
    ];
    assert.deepEqual(validate(phases, 'complex').parallelization_profile, {
      total_phases: 4,
      depth_map: { p1: 0, p2: 1, p3: 1, p4: 2 },
      batches: [
        { depth: 0, phase_ids: ['p1'] },
        { depth: 1, phase_ids: ['p2', 'p3'] },
        { depth: 2, phase_ids: ['p4'] },
      ],
      max_batch_size: 2,
      parallel_eligible: 2,
      effective_batches: 3,
    });
  });
});
