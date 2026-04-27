const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createServer } = require('../../src/mcp/core/create-server');
const { createToolPack } = require('../../src/mcp/tool-packs/session');
const { ensureWorkspace } = require('../../src/state/session-state');

function readSessionFrontmatter(projectRoot) {
  const content = fs.readFileSync(
    path.join(projectRoot, 'docs/maestro/state/active-session.md'),
    'utf8'
  );
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return JSON.parse(match[1]);
}

describe('session tool pack', () => {
  it('registers the session lifecycle tools through the kernel', () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    assert.deepEqual(
      server.getToolSchemas().map((schema) => schema.name),
      [
        'create_session',
        'get_session_status',
        'update_session',
        'append_session_phases',
        'transition_phase',
        'archive_session',
        'enter_design_gate',
        'record_design_approval',
        'get_design_gate_status',
        'scan_phase_changes',
        'reconcile_phase',
      ]
    );
  });

  it('transition_phase input schema documents kind-aware handoff fields', () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    const transitionPhase = server
      .getToolSchemas()
      .find((schema) => schema.name === 'transition_phase');
    assert.ok(transitionPhase, 'transition_phase tool must exist');

    const props = transitionPhase.inputSchema.properties;
    assert.ok(props.findings, 'findings should be in schema');
    assert.equal(props.findings.type, 'array');
    assert.ok(props.addressed_finding_ids, 'addressed_finding_ids should be in schema');
    assert.equal(props.addressed_finding_ids.type, 'array');
    assert.ok(props.final_artifacts, 'final_artifacts should be in schema');
    assert.equal(props.final_artifacts.type, 'object');
  });

  it('append_session_phases input schema documents lifecycle phase appends', () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    const appendPhases = server
      .getToolSchemas()
      .find((schema) => schema.name === 'append_session_phases');
    assert.ok(appendPhases, 'append_session_phases tool must exist');

    const props = appendPhases.inputSchema.properties;
    assert.ok(props.phases, 'phases should be in schema');
    assert.equal(props.phases.type, 'array');
    assert.ok(props.start_phase_id, 'start_phase_id should be in schema');
  });

  it('creates, updates, and transitions session state on disk', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-session-'));
    ensureWorkspace('docs/maestro', projectRoot);
    fs.writeFileSync(path.join(projectRoot, 'docs/maestro/plans/design.md'), '# Design\n');
    fs.writeFileSync(path.join(projectRoot, 'docs/maestro/plans/plan.md'), '# Plan\n');

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    const createResult = await server.callTool(
      'create_session',
      {
        session_id: 'test-session',
        task: 'Test session lifecycle',
        task_complexity: 'complex',
        design_document: 'docs/maestro/plans/design.md',
        implementation_plan: 'docs/maestro/plans/plan.md',
        phases: [
          { id: 1, name: 'Phase 1', agent: 'coder', parallel: false, blocked_by: [] },
          { id: 2, name: 'Phase 2', agent: 'coder', parallel: false, blocked_by: [1] },
        ],
      },
      projectRoot
    );

    assert.equal(createResult.ok, true);

    const updateResult = await server.callTool(
      'update_session',
      {
        session_id: 'test-session',
        execution_mode: 'sequential',
        execution_backend: 'native',
      },
      projectRoot
    );

    assert.equal(updateResult.ok, true);

    const transitionResult = await server.callTool(
      'transition_phase',
      {
        session_id: 'test-session',
        completed_phase_id: 1,
        next_phase_id: 2,
        files_created: ['src/generated.js'],
        files_modified: ['src/existing.js'],
        downstream_context: {
          key_interfaces_introduced: ['createServer(options)'],
          patterns_established: ['pack-based composition'],
          integration_points: ['session pack'],
          assumptions: ['phases are sequential'],
          warnings: [],
        },
      },
      projectRoot
    );

    assert.equal(transitionResult.ok, true);
    assert.deepEqual(transitionResult.result.session_state_summary.completed_phases, [
      1,
    ]);

    const sessionState = readSessionFrontmatter(projectRoot);
    assert.equal(sessionState.execution_mode, 'sequential');
    assert.equal(sessionState.current_phase, 2);
    assert.equal(sessionState.phases[0].kind, 'implementation');
    assert.equal(sessionState.phases[1].kind, 'implementation');
    assert.deepEqual(sessionState.phases[0].files_created, ['src/generated.js']);
    assert.deepEqual(sessionState.phases[0].files_modified, ['src/existing.js']);
    assert.equal(sessionState.phases[1].status, 'in_progress');
  });

  it('rejects create_session when a phase is missing required fields', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-session-'));
    ensureWorkspace('docs/maestro', projectRoot);

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    const outcome = await server.callTool(
      'create_session',
      {
        session_id: 'bad-plan',
        task: 'missing field test',
        phases: [{ id: 1, name: 'Only id/name' }],
      },
      projectRoot
    );

    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /missing_required_field|agent|parallel|blocked_by/i);
  });

  it('persists planned_files for every phase', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-session-'));
    ensureWorkspace('docs/maestro', projectRoot);

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    await server.callTool(
      'create_session',
      {
        session_id: 'with-planned',
        task: 'planned-files test',
        task_complexity: 'simple',
        phases: [
          {
            id: 1,
            name: 'Scaffold',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
            files: ['src/foo.js', 'src/bar.js'],
          },
        ],
      },
      projectRoot
    );

    const session = readSessionFrontmatter(projectRoot);
    assert.deepEqual(session.phases[0].planned_files, ['src/foo.js', 'src/bar.js']);
  });

  it('preserves string phase ids end-to-end through create_session and transition_phase', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-string-id-'));
    ensureWorkspace('docs/maestro', projectRoot);

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    const createResult = await server.callTool(
      'create_session',
      {
        session_id: 'string-id-test',
        task: 'string-id round-trip',
        task_complexity: 'simple',
        phases: [
          {
            id: 'design',
            name: 'Design phase',
            agent: 'architect',
            parallel: false,
            blocked_by: [],
          },
          {
            id: 'impl',
            name: 'Implementation phase',
            agent: 'coder',
            parallel: false,
            blocked_by: ['design'],
          },
        ],
      },
      projectRoot
    );
    assert.equal(createResult.ok, true);

    const session = readSessionFrontmatter(projectRoot);
    assert.equal(session.current_phase, 'design');
    assert.equal(session.phases[0].id, 'design');
    assert.equal(session.phases[1].id, 'impl');
    assert.deepEqual(session.phases[1].blocked_by, ['design']);

    const transitionResult = await server.callTool(
      'transition_phase',
      {
        session_id: 'string-id-test',
        completed_phase_id: 'design',
        next_phase_id: 'impl',
        files_created: [],
        files_modified: [],
        files_deleted: [],
        downstream_context: {
          key_interfaces_introduced: [],
          patterns_established: [],
          integration_points: [],
          assumptions: [],
          warnings: [],
        },
      },
      projectRoot
    );
    assert.equal(transitionResult.ok, true);
    assert.deepEqual(
      transitionResult.result.session_state_summary.completed_phases,
      ['design']
    );
    assert.equal(transitionResult.result.session_state_summary.current_phase, 'impl');
  });

  it('appends lifecycle phases, starts ready phases, and archives the full kind breakdown', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-append-life-'));
    ensureWorkspace('docs/maestro', projectRoot);

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    await server.callTool(
      'create_session',
      {
        session_id: 'append-life',
        task: 'append lifecycle phases',
        task_complexity: 'simple',
        phases: [
          {
            id: 1,
            name: 'Build',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
            files: ['src/foo.js'],
          },
        ],
      },
      projectRoot
    );

    await server.callTool(
      'transition_phase',
      {
        session_id: 'append-life',
        completed_phase_id: 1,
        files_created: ['src/foo.js'],
        downstream_context: { integration_points: ['src/foo.js'] },
      },
      projectRoot
    );

    const reviewAppend = await server.callTool(
      'append_session_phases',
      {
        session_id: 'append-life',
        phases: [
          {
            id: 'review-1',
            name: 'Code review',
            agent: 'code-reviewer',
            parallel: false,
            blocked_by: [1],
            kind: 'review',
          },
        ],
        start_phase_id: 'review-1',
      },
      projectRoot
    );

    assert.equal(reviewAppend.ok, true, reviewAppend.error || '');
    assert.equal(reviewAppend.result.started_phase_id, 'review-1');

    await server.callTool(
      'transition_phase',
      {
        session_id: 'append-life',
        completed_phase_id: 'review-1',
        findings: [{ id: 'F1', severity: 'major', summary: 'Fix needed' }],
      },
      projectRoot
    );

    const revisionAppend = await server.callTool(
      'append_session_phases',
      {
        session_id: 'append-life',
        phases: [
          {
            id: 'revision-1',
            name: 'Address review',
            agent: 'coder',
            parallel: false,
            blocked_by: ['review-1'],
            kind: 'revision',
            parent_phase_id: 'review-1',
          },
        ],
        start_phase_id: 'revision-1',
      },
      projectRoot
    );

    assert.equal(revisionAppend.ok, true, revisionAppend.error || '');

    await server.callTool(
      'transition_phase',
      {
        session_id: 'append-life',
        completed_phase_id: 'revision-1',
        addressed_finding_ids: ['F1'],
      },
      projectRoot
    );

    const verificationAppend = await server.callTool(
      'append_session_phases',
      {
        session_id: 'append-life',
        phases: [
          {
            id: 'verify-1',
            name: 'Verify artifacts',
            agent: 'coder',
            parallel: false,
            blocked_by: ['revision-1'],
            kind: 'verification',
          },
        ],
        start_phase_id: 'verify-1',
      },
      projectRoot
    );

    assert.equal(verificationAppend.ok, true, verificationAppend.error || '');

    await server.callTool(
      'transition_phase',
      {
        session_id: 'append-life',
        completed_phase_id: 'verify-1',
        final_artifacts: { 'src/foo.js': 'sha:abc' },
      },
      projectRoot
    );

    const state = readSessionFrontmatter(projectRoot);
    assert.equal(state.total_phases, 4);
    assert.deepEqual(
      state.phases.map((phase) => phase.kind),
      ['implementation', 'review', 'revision', 'verification']
    );

    const archive = await server.callTool(
      'archive_session',
      { session_id: 'append-life' },
      projectRoot
    );

    assert.equal(archive.ok, true, archive.error || '');
    assert.deepEqual(archive.result.phase_breakdown.by_kind, {
      implementation: 1,
      review: 1,
      revision: 1,
      verification: 1,
    });
  });

  it('rejects invalid lifecycle phase appends', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-append-bad-'));
    ensureWorkspace('docs/maestro', projectRoot);

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    await server.callTool(
      'create_session',
      {
        session_id: 'append-bad',
        task: 'append bad phases',
        task_complexity: 'simple',
        phases: [
          {
            id: 1,
            name: 'Build',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
          },
        ],
      },
      projectRoot
    );

    const invalidKind = await server.callTool(
      'append_session_phases',
      {
        session_id: 'append-bad',
        phases: [
          {
            id: 2,
            name: 'Implementation expansion',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
            kind: 'implementation',
          },
        ],
      },
      projectRoot
    );
    assert.equal(invalidKind.ok, false);
    assert.equal(invalidKind.code, 'INVALID_PHASE_KIND');

    const duplicate = await server.callTool(
      'append_session_phases',
      {
        session_id: 'append-bad',
        phases: [
          {
            id: 1,
            name: 'Review',
            agent: 'code-reviewer',
            parallel: false,
            blocked_by: [],
            kind: 'review',
          },
        ],
      },
      projectRoot
    );
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.code, 'INVALID_PHASE_GRAPH');
    assert.match(duplicate.error || '', /duplicate_id/);

    const dangling = await server.callTool(
      'append_session_phases',
      {
        session_id: 'append-bad',
        phases: [
          {
            id: 2,
            name: 'Review',
            agent: 'code-reviewer',
            parallel: false,
            blocked_by: [99],
            kind: 'review',
          },
        ],
      },
      projectRoot
    );
    assert.equal(dangling.ok, false);
    assert.equal(dangling.code, 'INVALID_PHASE_GRAPH');
    assert.match(dangling.error || '', /dangling_dependency/);

    const blocked = await server.callTool(
      'append_session_phases',
      {
        session_id: 'append-bad',
        phases: [
          {
            id: 2,
            name: 'Review',
            agent: 'code-reviewer',
            parallel: false,
            blocked_by: [1],
            kind: 'review',
          },
        ],
        start_phase_id: 2,
      },
      projectRoot
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'PHASE_DEPENDENCIES_INCOMPLETE');
  });

  it('returns structured not-found errors for invalid transition phase ids', async () => {
    const cases = [
      {
        name: 'completed',
        args: { completed_phase_id: 999 },
        error: /Phase 999 not found in session state/,
      },
      {
        name: 'next',
        args: { next_phase_id: 999 },
        error: /next_phase_id 999 does not match any phase in session state/,
      },
      {
        name: 'next-batch',
        args: { next_phase_ids: [999] },
        error: /Phase 999 not found in session state/,
      },
    ];

    for (const testCase of cases) {
      const projectRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), `maestro-invalid-phase-${testCase.name}-`)
      );
      ensureWorkspace('docs/maestro', projectRoot);

      const server = createServer({
        runtimeConfig: { name: 'codex' },
        services: {},
        toolPacks: [createToolPack],
      });

      const createResult = await server.callTool(
        'create_session',
        {
          session_id: 'invalid-phase-test',
          task: 'invalid phase id regression',
          task_complexity: 'simple',
          phases: [
            {
              id: 1,
              name: 'Phase 1',
              agent: 'coder',
              parallel: false,
              blocked_by: [],
            },
          ],
        },
        projectRoot
      );
      assert.equal(createResult.ok, true);

      const transitionResult = await server.callTool(
        'transition_phase',
        {
          session_id: 'invalid-phase-test',
          ...testCase.args,
        },
        projectRoot
      );

      assert.equal(transitionResult.ok, false);
      assert.equal(transitionResult.code, 'NOT_FOUND');
      assert.match(transitionResult.error, testCase.error);
      assert.doesNotMatch(transitionResult.error, /ReferenceError|NotFoundError is not defined/);
    }
  });

  it('archives the active session and associated plan files', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-archive-'));
    ensureWorkspace('docs/maestro', projectRoot);

    const designPath = path.join(projectRoot, 'docs/maestro/plans/design.md');
    const planPath = path.join(projectRoot, 'docs/maestro/plans/plan.md');
    fs.writeFileSync(designPath, '# design\n');
    fs.writeFileSync(planPath, '# plan\n');

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    await server.callTool(
      'create_session',
      {
        session_id: 'archive-session',
        task: 'Archive test',
        design_document: 'docs/maestro/plans/design.md',
        implementation_plan: 'docs/maestro/plans/plan.md',
        phases: [{ id: 1, name: 'Phase 1', agent: 'coder', parallel: false, blocked_by: [] }],
      },
      projectRoot
    );

    const archiveResult = await server.callTool(
      'archive_session',
      { session_id: 'archive-session' },
      projectRoot
    );

    assert.equal(archiveResult.ok, true);
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'docs/maestro/state/active-session.md')),
      false
    );
    assert.equal(
      fs.existsSync(
        path.join(
          projectRoot,
          'docs/maestro/state/archive/archive-session.md'
        )
      ),
      true
    );
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'docs/maestro/plans/archive/design.md')),
      true
    );
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'docs/maestro/plans/archive/plan.md')),
      true
    );

    assert.ok(
      archiveResult.result && archiveResult.result.phase_breakdown,
      'archive response should include phase_breakdown'
    );
    assert.deepEqual(archiveResult.result.phase_breakdown.by_kind, {
      implementation: 1,
      review: 0,
      revision: 0,
      verification: 0,
    });
    assert.deepEqual(archiveResult.result.phase_breakdown.unknown_kinds, {});
  });

  it('archive_session phase_breakdown groups phases by kind', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-archive-kind-'));
    ensureWorkspace('docs/maestro', projectRoot);

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    await server.callTool(
      'create_session',
      {
        session_id: 'kind-breakdown',
        task: 'kind breakdown test',
        task_complexity: 'medium',
        phases: [
          { id: 1, name: 'Build', agent: 'coder', parallel: false, blocked_by: [], kind: 'implementation' },
          { id: 2, name: 'Review', agent: 'code-reviewer', parallel: false, blocked_by: [1], kind: 'review' },
          { id: 3, name: 'Fix', agent: 'coder', parallel: false, blocked_by: [2], kind: 'revision', parent_phase_id: 2 },
          { id: 4, name: 'Verify', agent: 'coder', parallel: false, blocked_by: [3], kind: 'verification' },
        ],
      },
      projectRoot
    );

    const archiveResult = await server.callTool(
      'archive_session',
      { session_id: 'kind-breakdown' },
      projectRoot
    );

    assert.equal(archiveResult.ok, true);
    assert.deepEqual(archiveResult.result.phase_breakdown.by_kind, {
      implementation: 1,
      review: 1,
      revision: 1,
      verification: 1,
    });
    assert.deepEqual(archiveResult.result.phase_breakdown.unknown_kinds, {});
  });

  it('transition_phase rejects completion with files but empty downstream_context', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-handoff-'));
    ensureWorkspace('docs/maestro', projectRoot);

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    await server.callTool(
      'create_session',
      {
        session_id: 'handoff-test',
        task: 'handoff validation',
        task_complexity: 'simple',
        phases: [
          {
            id: 1,
            name: 'Phase 1',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
            files: ['src/foo.js'],
          },
        ],
      },
      projectRoot
    );

    const outcome = await server.callTool(
      'transition_phase',
      {
        session_id: 'handoff-test',
        completed_phase_id: 1,
        files_created: ['src/foo.js'],
        downstream_context: {
          key_interfaces_introduced: [],
          patterns_established: [],
          integration_points: [],
          assumptions: [],
          warnings: [],
        },
      },
      projectRoot
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, 'HANDOFF_INCOMPLETE');
    assert.match(outcome.error || '', /downstream_context/i);
  });

  it('archive_session blocks when a phase requires reconciliation', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-archive-'));
    ensureWorkspace('docs/maestro', projectRoot);

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    await server.callTool(
      'create_session',
      {
        session_id: 'arch-rec',
        task: 'archive reconciliation test',
        task_complexity: 'simple',
        phases: [
          {
            id: 1,
            name: 'Phase 1',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
            files: ['src/foo.js'],
            kind: 'implementation',
          },
          {
            id: 2,
            name: 'Phase 2 terminal',
            agent: 'coder',
            parallel: false,
            blocked_by: [1],
            files: [],
            kind: 'verification',
          },
        ],
      },
      projectRoot
    );

    await server.callTool(
      'transition_phase',
      {
        session_id: 'arch-rec',
        completed_phase_id: 1,
        files_created: [],
        files_modified: [],
        files_deleted: [],
        downstream_context: {},
      },
      projectRoot
    );

    const outcome = await server.callTool(
      'archive_session',
      { session_id: 'arch-rec' },
      projectRoot
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /reconciliation/i);
  });
});
