import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { handleCreateSession, handleTransitionPhase, handleArchiveSession } from '../../dist/src/mcp/handlers/session-state-tools.js';
import { recordCodeReview } from '../../dist/src/mcp/session/session-lifecycle-service.js';
import { ensureMaestroWorkspace, makeTempWorkspace, readSessionFrontmatter } from '../support/mcp.js';

function makeWorkspace(testContext) {
  return ensureMaestroWorkspace(
    makeTempWorkspace('maestro-agent-perf-capture-', testContext)
  );
}

const TASK_REPORT = `## Task Report
Implemented the feature.

## Blockers
- BLOCKER: Which cache backend?
  Context: Two options remain viable.
  Required to proceed: A backend choice.
- BLOCKER: Confirm the migration order?
  Context: Two migrations touch the same table.
  Required to proceed: Ordering guidance.

## Downstream Context
Nothing else.
`;

const POPULATED_CONTEXT = {
  key_interfaces_introduced: ['ICacheBackend'],
  patterns_established: [],
  integration_points: [],
  assumptions: [],
  warnings: [],
};

describe('transition_phase blocker/finding capture', () => {
  it('derives blocker_count from task_report and stores review_finding_count', (t) => {
    const workspace = makeWorkspace(t);
    handleCreateSession(
      {
        session_id: 'perf-session',
        task: 'Capture signals',
        phases: [
          { id: 1, name: 'Phase 1', agent: 'coder', parallel: false, blocked_by: [] },
        ],
      },
      workspace
    );

    handleTransitionPhase(
      {
        session_id: 'perf-session',
        completed_phase_id: 1,
        task_report: TASK_REPORT,
        review_finding_count: 3,
        files_created: ['src/cache.js'],
        downstream_context: POPULATED_CONTEXT,
      },
      workspace
    );

    const frontmatter = readSessionFrontmatter(workspace);
    assert.equal(frontmatter.phases[0].blocker_count, 2);
    assert.equal(frontmatter.phases[0].review_finding_count, 3);
    assert.equal(frontmatter.phases[0].status, 'completed');
  });

  it('appends per-agent records to the durable ledger on archive', (t) => {
    const workspace = makeWorkspace(t);
    handleCreateSession(
      {
        session_id: 'perf-session',
        task: 'Capture signals',
        phases: [
          { id: 1, name: 'Phase 1', agent: 'coder', parallel: false, blocked_by: [] },
        ],
      },
      workspace
    );
    handleTransitionPhase(
      {
        session_id: 'perf-session',
        completed_phase_id: 1,
        task_report: TASK_REPORT,
        review_finding_count: 3,
        files_created: ['src/cache.js'],
        downstream_context: POPULATED_CONTEXT,
      },
      workspace
    );
    recordCodeReview(
      {
        session_id: 'perf-session',
        reviewed_phase_ids: [1],
        reviewer_agent: 'code_reviewer',
        reviewed_files: ['src/cache.js'],
        finding_count: 3,
        blocking_finding_count: 0,
        summary: 'Cache implementation approved.',
      },
      workspace
    );
    handleArchiveSession({ session_id: 'perf-session' }, workspace);

    const ledger = JSON.parse(
      fs.readFileSync(
        path.join(workspace, 'docs', 'maestro', 'knowledge', 'agent-performance.json'),
        'utf8'
      )
    );
    assert.equal(ledger.records.length, 1);
    assert.equal(ledger.records[0].agent, 'coder');
    assert.equal(ledger.records[0].session_id, 'perf-session');
    assert.equal(ledger.records[0].blocker_count, 2);
    assert.equal(ledger.records[0].review_finding_count, 3);
  });

  it('leaves blocker_count untouched when task_report is absent', (t) => {
    const workspace = makeWorkspace(t);
    handleCreateSession(
      {
        session_id: 'perf-session',
        task: 'No report',
        phases: [
          { id: 1, name: 'Phase 1', agent: 'coder', parallel: false, blocked_by: [] },
        ],
      },
      workspace
    );
    handleTransitionPhase(
      {
        session_id: 'perf-session',
        completed_phase_id: 1,
        files_created: ['src/cache.js'],
        downstream_context: POPULATED_CONTEXT,
      },
      workspace
    );
    const frontmatter = readSessionFrontmatter(workspace);
    assert.equal(frontmatter.phases[0].blocker_count, 0);
  });
});
