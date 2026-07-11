import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as markdownState from '../../dist/src/core/markdown-state.js';
import { createEmptyDownstreamContext } from '../../dist/src/mcp/contracts/downstream-context.js';
import { SessionStateSchema } from '../../dist/src/mcp/contracts/session-state-schema.js';
import { handleGetDesignGateStatus } from '../../dist/src/mcp/handlers/design-gate.js';
import { handleForkSession, handleListLineage } from '../../dist/src/mcp/handlers/session-lineage.js';
import { ensureMaestroWorkspace, makeTempWorkspace, readSessionFrontmatter } from '../support/mcp.js';

function phaseFixture(overrides = {}) {
  return {
    id: 1,
    name: 'Phase 1',
    status: 'completed',
    agents: ['coder'],
    parallel: false,
    started: '2026-07-01T00:00:00.000Z',
    completed: '2026-07-01T00:10:00.000Z',
    blocked_by: [],
    files_created: ['created.txt'],
    files_modified: ['modified.txt'],
    files_deleted: ['deleted.txt'],
    planned_files: ['planned.txt'],
    downstream_context: {
      key_interfaces_introduced: ['old interface'],
      patterns_established: [],
      integration_points: [],
      assumptions: [],
      warnings: [],
    },
    errors: [],
    retry_count: 1,
    blocker_count: 2,
    review_finding_count: 3,
    ...overrides,
  };
}

function archivedState(overrides = {}) {
  return {
    schema_version: 2,
    session_id: 'source-session',
    parent_session_id: null,
    branch: null,
    task: 'source task',
    created: '2026-07-01T00:00:00.000Z',
    updated: '2026-07-01T00:20:00.000Z',
    status: 'completed',
    workflow_mode: 'standard',
    design_document: '/tmp/source-design.md',
    implementation_plan: '/tmp/source-plan.md',
    current_phase: 2,
    total_phases: 2,
    execution_mode: 'sequential',
    execution_backend: 'native',
    current_batch: null,
    task_complexity: 'medium',
    token_usage: {
      total_input: 10,
      total_output: 20,
      total_cached: 0,
      by_agent: {},
    },
    phases: [
      phaseFixture({
        id: 1,
        name: 'Design',
        agents: ['architect'],
        parallel: true,
      }),
      phaseFixture({
        id: 2,
        name: 'Build',
        status: 'failed',
        agents: ['coder'],
        blocked_by: [1],
      }),
    ],
    ...overrides,
  };
}

function writeArchivedSession(workspace, state) {
  const archiveDir = path.join(
    workspace,
    'docs',
    'maestro',
    'state',
    'archive'
  );
  fs.mkdirSync(archiveDir, { recursive: true });
  const filePath = path.join(archiveDir, `${state.session_id}.md`);
  fs.writeFileSync(filePath, markdownState.serialize(state, '# archived\n'));
  return filePath;
}

describe('session lineage handlers', () => {
  it('fork_session clones an archived session into a V2 active child', (t) => {
    const workspace = ensureMaestroWorkspace(
      makeTempWorkspace('maestro-lineage-fork-', t)
    );
    writeArchivedSession(workspace, archivedState());

    const result = handleForkSession(
      {
        source_session_id: 'source-session',
        new_session_id: 'fork-session',
        branch: 'experiment',
      },
      workspace
    );

    assert.equal(result.success, true);
    const active = readSessionFrontmatter(workspace);
    assert.deepEqual(SessionStateSchema.parse(active), active);
    assert.equal(active.schema_version, 2);
    assert.equal(active.session_id, 'fork-session');
    assert.equal(active.parent_session_id, 'source-session');
    assert.equal(active.branch, 'experiment');
    assert.equal(active.task, 'source task');
    assert.equal(active.task_complexity, 'medium');
    assert.equal(active.design_document, '/tmp/source-design.md');
    assert.equal(active.implementation_plan, '/tmp/source-plan.md');
    assert.equal(active.current_phase, 1);
    assert.equal(active.total_phases, 2);
    assert.deepEqual(
      active.phases.map((phase) => phase.status),
      ['pending', 'pending']
    );
    assert.deepEqual(active.phases[0].agents, ['architect']);
    assert.equal(active.phases[0].parallel, true);
    assert.deepEqual(active.phases[1].blocked_by, [1]);
    for (const phase of active.phases) {
      assert.equal(phase.started, null);
      assert.equal(phase.completed, null);
      assert.deepEqual(phase.files_created, []);
      assert.deepEqual(phase.files_modified, []);
      assert.deepEqual(phase.files_deleted, []);
      assert.deepEqual(phase.downstream_context, createEmptyDownstreamContext());
    }

    const gate = handleGetDesignGateStatus(
      { session_id: 'fork-session' },
      workspace
    );
    assert.equal(gate.session_id, 'fork-session');
    assert.equal(typeof gate.approved_at, 'string');
    assert.equal(gate.design_document_path, '/tmp/source-design.md');
  });

  it('list_lineage returns parent and children across active and archived sessions', (t) => {
    const workspace = ensureMaestroWorkspace(
      makeTempWorkspace('maestro-lineage-list-', t)
    );
    writeArchivedSession(workspace, archivedState());
    writeArchivedSession(
      workspace,
      archivedState({
        session_id: 'archived-child',
        parent_session_id: 'source-session',
        branch: 'archive-branch',
      })
    );
    handleForkSession(
      {
        source_session_id: 'source-session',
        new_session_id: 'active-child',
        branch: 'active-branch',
      },
      workspace
    );

    const sourceLineage = handleListLineage(
      { session_id: 'source-session' },
      workspace
    );
    assert.equal(sourceLineage.session_id, 'source-session');
    assert.equal(sourceLineage.parent_session_id, null);
    assert.deepEqual(
      sourceLineage.children.map((child) => child.session_id).sort(),
      ['active-child', 'archived-child']
    );

    const childLineage = handleListLineage(
      { session_id: 'active-child' },
      workspace
    );
    assert.equal(childLineage.session_id, 'active-child');
    assert.equal(childLineage.parent_session_id, 'source-session');
    assert.deepEqual(childLineage.children, []);
  });
});
