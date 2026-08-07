import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInitializedMcpWorkspace, phaseFixture } from '../support/mcp.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Code Review Archive Gate Integration', () => {
  it('enforces code review for non-documentation changes before archive', async (t) => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'code-review-gate-',
      testContext: t,
    });

    const sessionId = 'review-gate-test-1';

    const created = await server.callTool(
      'create_session',
      {
        session_id: sessionId,
        task: 'Implement Widget Feature',
        phases: [
          phaseFixture({
            id: 1,
            name: 'Implementation',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
          }),
        ],
      },
      workspace
    );
    assert.equal(created.ok, true);

    const transitioned = await server.callTool(
      'transition_phase',
      {
        session_id: sessionId,
        completed_phase_id: 1,
        files_created: ['src/widget.ts'],
        downstream_context: {
          key_interfaces_introduced: ['WidgetAPI'],
        },
      },
      workspace
    );
    assert.equal(transitioned.ok, true);

    const archiveAttempt1 = await server.callTool(
      'archive_session',
      { session_id: sessionId },
      workspace
    );
    assert.equal(archiveAttempt1.ok, false);
    assert.equal(archiveAttempt1.code, 'CODE_REVIEW_REQUIRED');

    const stateFile = path.join(workspace, 'docs/maestro/state/active-session.md');
    assert.equal(fs.existsSync(stateFile), true);

    const unauthorizedReview = await server.callTool(
      'record_code_review',
      {
        session_id: sessionId,
        reviewed_phase_ids: [1],
        reviewer_agent: 'coder',
        reviewed_files: ['src/widget.ts'],
        finding_count: 0,
        blocking_finding_count: 0,
      },
      workspace
    );
    assert.equal(unauthorizedReview.ok, false);
    assert.equal(unauthorizedReview.code, 'INVALID_REVIEWER_AGENT');

    const reviewResult1 = await server.callTool(
      'record_code_review',
      {
        session_id: sessionId,
        reviewed_phase_ids: [1],
        reviewer_agent: 'code_reviewer',
        reviewed_files: ['src/widget.ts'],
        finding_count: 2,
        blocking_finding_count: 1,
        summary: 'Missing input validation in widget.ts',
      },
      workspace
    );
    assert.equal(reviewResult1.ok, true);
    assert.equal(reviewResult1.result.completion_review.status, 'blocked');

    const archiveAttempt2 = await server.callTool(
      'archive_session',
      { session_id: sessionId },
      workspace
    );
    assert.equal(archiveAttempt2.ok, false);
    assert.equal(archiveAttempt2.code, 'CODE_REVIEW_BLOCKED');

    const reviewResult2 = await server.callTool(
      'record_code_review',
      {
        session_id: sessionId,
        reviewed_phase_ids: [1],
        reviewer_agent: 'code_reviewer',
        reviewed_files: ['src/widget.ts'],
        finding_count: 0,
        blocking_finding_count: 0,
        summary: 'Validation fixed cleanly.',
      },
      workspace
    );
    assert.equal(reviewResult2.ok, true);
    assert.equal(reviewResult2.result.completion_review.status, 'passed');

    const archiveResult = await server.callTool(
      'archive_session',
      { session_id: sessionId },
      workspace
    );
    assert.equal(archiveResult.ok, true);
    assert.equal(archiveResult.result.success, true);
    assert.equal(fs.existsSync(stateFile), false);
  });

  it('allows documentation-only sessions to archive without review', async (t) => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'doc-review-gate-',
      testContext: t,
    });

    const sessionId = 'doc-session-1';

    await server.callTool(
      'create_session',
      {
        session_id: sessionId,
        task: 'Update Documentation',
        phases: [
          phaseFixture({
            id: 1,
            name: 'Docs',
            agent: 'technical_writer',
            parallel: false,
            blocked_by: [],
          }),
        ],
      },
      workspace
    );

    await server.callTool(
      'transition_phase',
      {
        session_id: sessionId,
        completed_phase_id: 1,
        files_created: ['docs/guide.md', 'README.md'],
        downstream_context: {
          key_interfaces_introduced: ['GuideSection'],
        },
      },
      workspace
    );

    const archiveResult = await server.callTool(
      'archive_session',
      { session_id: sessionId },
      workspace
    );
    assert.equal(archiveResult.ok, true);
    assert.equal(archiveResult.result.success, true);
  });

  it('blocks archival when a delegation failure is recorded', async (t) => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'failure-gate-',
      testContext: t,
    });

    const sessionId = 'failed-session-1';

    await server.callTool(
      'create_session',
      {
        session_id: sessionId,
        task: 'Failed Task',
        phases: [
          phaseFixture({
            id: 1,
            name: 'Build',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
          }),
        ],
      },
      workspace
    );

    const failRecord = await server.callTool(
      'record_phase_failure',
      {
        session_id: sessionId,
        phase_id: 1,
        agent: 'coder',
        failure_type: 'SUBAGENT_TIMEOUT',
        message: 'Coder subagent timed out after 300s',
      },
      workspace
    );
    assert.equal(failRecord.ok, true);
    assert.equal(failRecord.result.status, 'failed');

    const archiveAttempt = await server.callTool(
      'archive_session',
      { session_id: sessionId },
      workspace
    );
    assert.equal(archiveAttempt.ok, false);
    assert.equal(archiveAttempt.code, 'FAILED_PHASE_UNRESOLVED');
  });

  it('rejects code review with incomplete file coverage', async (t) => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'coverage-gate-',
      testContext: t,
    });

    const sessionId = 'coverage-session-1';

    await server.callTool(
      'create_session',
      {
        session_id: sessionId,
        task: 'Multi File Feature',
        phases: [
          phaseFixture({
            id: 1,
            name: 'Impl',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
          }),
        ],
      },
      workspace
    );

    await server.callTool(
      'transition_phase',
      {
        session_id: sessionId,
        completed_phase_id: 1,
        files_created: ['src/a.ts', 'src/b.ts'],
        downstream_context: { key_interfaces_introduced: ['TypeA'] },
      },
      workspace
    );

    const reviewResult = await server.callTool(
      'record_code_review',
      {
        session_id: sessionId,
        reviewed_phase_ids: [1],
        reviewer_agent: 'code_reviewer',
        reviewed_files: ['src/a.ts'],
        finding_count: 0,
        blocking_finding_count: 0,
      },
      workspace
    );
    assert.equal(reviewResult.ok, false);
    assert.equal(reviewResult.code, 'CODE_REVIEW_INCOMPLETE_COVERAGE');
  });

  it('invalidates a passing review when a later phase changes the same file', async (t) => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'same-file-review-stale-',
      testContext: t,
    });

    const sessionId = 'same-file-review-stale-1';

    const created = await server.callTool(
      'create_session',
      {
        session_id: sessionId,
        task: 'Implement and then revise the same widget file',
        phases: [
          phaseFixture({
            id: 1,
            name: 'Initial implementation',
            agent: 'coder',
            parallel: false,
            blocked_by: [],
          }),
          phaseFixture({
            id: 2,
            name: 'Follow-up revision',
            agent: 'coder',
            parallel: false,
            blocked_by: [1],
          }),
        ],
      },
      workspace
    );
    assert.equal(created.ok, true);

    const firstTransition = await server.callTool(
      'transition_phase',
      {
        session_id: sessionId,
        completed_phase_id: 1,
        next_phase_id: 2,
        files_created: ['src/widget.ts'],
        downstream_context: { key_interfaces_introduced: ['WidgetAPI'] },
      },
      workspace
    );
    assert.equal(firstTransition.ok, true);

    const firstReview = await server.callTool(
      'record_code_review',
      {
        session_id: sessionId,
        reviewed_phase_ids: [1],
        reviewer_agent: 'code_reviewer',
        reviewed_files: ['src/widget.ts'],
        finding_count: 0,
        blocking_finding_count: 0,
      },
      workspace
    );
    assert.equal(firstReview.ok, true);
    assert.equal(firstReview.result.completion_review.status, 'passed');

    const secondTransition = await server.callTool(
      'transition_phase',
      {
        session_id: sessionId,
        completed_phase_id: 2,
        files_modified: ['src/widget.ts'],
        downstream_context: { patterns_established: ['Revised WidgetAPI behavior'] },
      },
      workspace
    );
    assert.equal(secondTransition.ok, true);

    const status = await server.callTool(
      'get_session_status',
      { session_id: sessionId },
      workspace
    );
    assert.equal(status.ok, true);
    assert.equal(status.result.completion_review.status, 'pending');
    assert.equal(status.result.completion_review.reviewed_at, null);
    assert.deepEqual(status.result.completion_review.reviewed_files, []);

    const archiveAttempt = await server.callTool(
      'archive_session',
      { session_id: sessionId },
      workspace
    );
    assert.equal(archiveAttempt.ok, false);
    assert.equal(archiveAttempt.code, 'CODE_REVIEW_REQUIRED');
  });
});
