'use strict';

const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { handleValidatePlan } = require('../../src/mcp/handlers/validate-plan');
const {
  handleCreateSession,
  handleTransitionPhase,
  parseSessionState,
  serializeSessionState,
} = require('../../src/mcp/handlers/session-state-tools');
const { buildDetachedPayload } = require('../../src/generator/payload-builder');

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupDir(dirPath) {
  if (dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function writeFile(base, relativePath, content) {
  const fullPath = path.join(base, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function createTestProjectRoot() {
  const root = createTempDir('maestro-test-');
  const stateDir = path.join(root, 'docs', 'maestro', 'state');
  const archiveDir = path.join(stateDir, 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  return root;
}

describe('Fix #2: computeDepths deduplication in validate-plan', () => {
  it('computes identical parallelization profile whether depths are used once or reused', () => {
    const phases = [
      { id: 'p1', name: 'Phase 1', agent: 'coder', parallel: true, blocked_by: [], files_created: ['a.js'] },
      { id: 'p2', name: 'Phase 2', agent: 'coder', parallel: true, blocked_by: [], files_created: ['b.js'] },
      { id: 'p3', name: 'Phase 3', agent: 'coder', parallel: false, blocked_by: ['p1', 'p2'], files_created: ['c.js'] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'complex' });

    assert.ok(result.parallelization_profile !== null);
    assert.equal(result.parallelization_profile.total_phases, 3);
    assert.equal(result.parallelization_profile.depth_map['p1'], 0);
    assert.equal(result.parallelization_profile.depth_map['p2'], 0);
    assert.equal(result.parallelization_profile.depth_map['p3'], 1);
    assert.equal(result.parallelization_profile.max_batch_size, 2);
  });

  it('parallelization profile is null when cycles exist (depths not computed)', () => {
    const phases = [
      { id: 'A', name: 'Phase A', agent: 'architect', parallel: true, blocked_by: ['B'], files_created: ['x.js'] },
      { id: 'B', name: 'Phase B', agent: 'architect', parallel: true, blocked_by: ['A'], files_created: ['y.js'] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'medium' });

    assert.equal(result.parallelization_profile, null);
    assert.ok(result.violations.some((v) => v.rule === 'cyclic_dependency'));
  });

  it('file overlap detection uses same depth computation as parallelization profile', () => {
    const phases = [
      { id: 'p1', name: 'Build A', agent: 'coder', parallel: true, blocked_by: [], files_created: ['shared.js'] },
      { id: 'p2', name: 'Build B', agent: 'coder', parallel: true, blocked_by: [], files_modified: ['shared.js'] },
      { id: 'p3', name: 'Integrate', agent: 'coder', parallel: false, blocked_by: ['p1', 'p2'] },
    ];
    const result = handleValidatePlan({ plan: { phases }, task_complexity: 'complex' });

    assert.ok(result.violations.some((v) => v.rule === 'file_overlap'));
    assert.ok(result.parallelization_profile !== null);
    assert.equal(result.parallelization_profile.depth_map['p1'], 0);
    assert.equal(result.parallelization_profile.depth_map['p2'], 0);
    assert.equal(result.parallelization_profile.depth_map['p3'], 1);
  });
});

describe('Fix #3: atomic timestamp in handleTransitionPhase', () => {
  let projectRoot = null;

  afterEach(() => {
    cleanupDir(projectRoot);
    projectRoot = null;
  });

  it('uses a single timestamp for completed phase, started phase, and state.updated', () => {
    projectRoot = createTestProjectRoot();

    handleCreateSession({
      session_id: 'timestamp-test',
      task: 'Test atomic timestamps',
      phases: [
        { id: 1, name: 'Phase 1', agent: 'coder', blocked_by: [] },
        { id: 2, name: 'Phase 2', agent: 'coder', blocked_by: [1] },
      ],
    }, projectRoot);

    handleTransitionPhase({
      session_id: 'timestamp-test',
      completed_phase_id: 1,
      next_phase_id: 2,
      downstream_context: { key_interfaces_introduced: [], patterns_established: [], integration_points: [], assumptions: [], warnings: [] },
    }, projectRoot);

    const sessionPath = path.join(projectRoot, 'docs', 'maestro', 'state', 'active-session.md');
    const content = fs.readFileSync(sessionPath, 'utf8');
    const state = parseSessionState(content);

    const completedPhase = state.phases.find((p) => p.id === 1);
    const startedPhase = state.phases.find((p) => p.id === 2);

    assert.equal(completedPhase.completed, startedPhase.started);
    assert.equal(completedPhase.completed, state.updated);
  });

  it('uses a single timestamp for batch transitions with multiple started phases', () => {
    projectRoot = createTestProjectRoot();

    handleCreateSession({
      session_id: 'batch-timestamp-test',
      task: 'Test batch atomic timestamps',
      phases: [
        { id: 1, name: 'Phase 1', agent: 'coder', blocked_by: [] },
        { id: 2, name: 'Phase 2a', agent: 'coder', blocked_by: [1] },
        { id: 3, name: 'Phase 2b', agent: 'tester', blocked_by: [1] },
      ],
    }, projectRoot);

    handleTransitionPhase({
      session_id: 'batch-timestamp-test',
      completed_phase_id: 1,
      next_phase_ids: [2, 3],
      downstream_context: { key_interfaces_introduced: [], patterns_established: [], integration_points: [], assumptions: [], warnings: [] },
    }, projectRoot);

    const sessionPath = path.join(projectRoot, 'docs', 'maestro', 'state', 'active-session.md');
    const content = fs.readFileSync(sessionPath, 'utf8');
    const state = parseSessionState(content);

    const completedPhase = state.phases.find((p) => p.id === 1);
    const startedPhase2 = state.phases.find((p) => p.id === 2);
    const startedPhase3 = state.phases.find((p) => p.id === 3);

    assert.equal(completedPhase.completed, startedPhase2.started);
    assert.equal(startedPhase2.started, startedPhase3.started);
    assert.equal(completedPhase.completed, state.updated);
  });
});

describe('Fix #8: cleanStale without redundant existsSync', () => {
  let srcDir = null;
  let outputDir = null;

  afterEach(() => {
    cleanupDir(srcDir);
    cleanupDir(outputDir);
    srcDir = null;
    outputDir = null;
  });

  it('removes empty directories after stale file cleanup', () => {
    srcDir = createTempDir('maestro-stale-src-');
    outputDir = createTempDir('maestro-stale-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(outputDir, 'core/logger.js', 'content');
    writeFile(outputDir, 'core/stale-dir/old-file.js', 'stale');

    buildDetachedPayload(srcDir, outputDir);

    assert.ok(!fs.existsSync(path.join(outputDir, 'core', 'stale-dir', 'old-file.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'core', 'stale-dir')));
  });

  it('removes deeply nested empty directories after stale cleanup', () => {
    srcDir = createTempDir('maestro-deep-src-');
    outputDir = createTempDir('maestro-deep-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(outputDir, 'core/deep/nested/dir/stale.js', 'stale');

    buildDetachedPayload(srcDir, outputDir);

    assert.ok(!fs.existsSync(path.join(outputDir, 'core', 'deep')));
  });

  it('preserves non-empty directories during stale cleanup', () => {
    srcDir = createTempDir('maestro-keep-src-');
    outputDir = createTempDir('maestro-keep-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(srcDir, 'core/utils/helper.js', 'helper');
    writeFile(outputDir, 'core/utils/helper.js', 'helper');
    writeFile(outputDir, 'core/utils/stale.js', 'stale');

    buildDetachedPayload(srcDir, outputDir);

    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'utils')));
    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'utils', 'helper.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'core', 'utils', 'stale.js')));
  });
});

describe('Fix #12: readBoundedStdin removed from adapter contract', () => {
  it('claude adapter does not export readBoundedStdin', () => {
    const claudeAdapter = require('../../src/platforms/shared/adapters/claude-adapter');
    assert.equal(claudeAdapter.readBoundedStdin, undefined);
  });

  it('gemini adapter does not export readBoundedStdin', () => {
    const geminiAdapter = require('../../src/platforms/shared/adapters/gemini-adapter');
    assert.equal(geminiAdapter.readBoundedStdin, undefined);
  });

  it('qwen adapter does not export readBoundedStdin', () => {
    const qwenAdapter = require('../../src/platforms/shared/adapters/qwen-adapter');
    assert.equal(qwenAdapter.readBoundedStdin, undefined);
  });

  it('adapters still export the required contract: normalizeInput, formatOutput, errorFallback, getExitCode', () => {
    const adapters = [
      require('../../src/platforms/shared/adapters/claude-adapter'),
      require('../../src/platforms/shared/adapters/gemini-adapter'),
      require('../../src/platforms/shared/adapters/qwen-adapter'),
    ];

    for (const adapter of adapters) {
      assert.equal(typeof adapter.normalizeInput, 'function');
      assert.equal(typeof adapter.formatOutput, 'function');
      assert.equal(typeof adapter.errorFallback, 'function');
      assert.equal(typeof adapter.getExitCode, 'function');
    }
  });
});
