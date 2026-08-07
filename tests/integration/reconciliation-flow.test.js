import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createInitializedMcpWorkspace, phaseFixture } from '../support/mcp.js';

describe('reconciliation flow', () => {
  it('covers the hung-worker postmortem scenario end to end', async (t) => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'maestro-rec-flow-',
      testContext: t,
    });

    await server.callTool(
      'create_session',
      {
        session_id: 'rf-1',
        task: 'hung-worker recovery',
        task_complexity: 'simple',
        phases: [
          phaseFixture({
            name: 'Scaffold',
            agent: 'design-system-engineer',
            files: ['index.html', 'assets/css/styles.css'],
          }),
        ],
      },
      workspace
    );

    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(path.join(workspace, 'index.html'), '<html/>');
    fs.mkdirSync(path.join(workspace, 'assets', 'css'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'assets', 'css', 'styles.css'), 'body{}');

    await server.callTool(
      'transition_phase',
      {
        session_id: 'rf-1',
        completed_phase_id: 1,
        files_created: [],
        files_modified: [],
        files_deleted: [],
        downstream_context: {},
      },
      workspace
    );

    const scan = await server.callTool(
      'scan_phase_changes',
      { session_id: 'rf-1', phase_id: 1 },
      workspace
    );
    assert.equal(scan.ok, true);
    assert.ok(scan.result.candidates.created.includes('index.html'));
    assert.ok(scan.result.candidates.created.includes('assets/css/styles.css'));

    const reconciled = await server.callTool(
      'reconcile_phase',
      {
        session_id: 'rf-1',
        phase_id: 1,
        files_created: ['index.html', 'assets/css/styles.css'],
        downstream_context: {
          integration_points: ['index.html', 'assets/css/styles.css'],
        },
      },
      workspace
    );
    assert.equal(reconciled.ok, true);

    await server.callTool(
      'record_code_review',
      {
        session_id: 'rf-1',
        reviewed_phase_ids: [1],
        reviewer_agent: 'code_reviewer',
        reviewed_files: ['index.html', 'assets/css/styles.css'],
        finding_count: 0,
        blocking_finding_count: 0,
        summary: 'Hung worker output reviewed cleanly.',
      },
      workspace
    );

    const archive = await server.callTool(
      'archive_session',
      { session_id: 'rf-1' },
      workspace
    );
    assert.equal(archive.ok, true);
  });
});
