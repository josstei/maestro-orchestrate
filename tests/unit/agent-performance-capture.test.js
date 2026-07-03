'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  handleCreateSession,
  handleTransitionPhase,
  handleArchiveSession,
} = require('../../src/mcp/handlers/session-state-tools');
const {
  ensureMaestroWorkspace,
  makeTempWorkspace,
  readSessionFrontmatter,
} = require('../support/mcp');

const tmpRoots = [];

function makeWorkspace() {
  const workspace = ensureMaestroWorkspace(
    makeTempWorkspace('maestro-agent-perf-capture-')
  );
  tmpRoots.push(workspace);
  return workspace;
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

after(() => {
  for (const root of tmpRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('transition_phase blocker/finding capture', () => {
  it('derives blocker_count from task_report and stores review_finding_count', () => {
    const workspace = makeWorkspace();
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

  it('appends per-agent records to the durable ledger on archive', () => {
    const workspace = makeWorkspace();
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

  it('leaves blocker_count untouched when task_report is absent', () => {
    const workspace = makeWorkspace();
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
