import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInitializedMcpWorkspace, phaseFixture, readSessionFrontmatter } from '../support/mcp.js';

describe('create_session schema stamping (write path)', () => {
  it('stamps schema_version and per-phase counters at creation', async (t) => {
    const { server, workspace } = await createInitializedMcpWorkspace({
      prefix: 'maestro-schema-stamp-',
      testContext: t,
    });

    const created = await server.callTool(
      'create_session',
      {
        session_id: 'ss-1',
        task: 'schema stamp',
        task_complexity: 'simple',
        phases: [
          phaseFixture({ id: 1, name: 'P1', agent: 'coder' }),
          phaseFixture({ id: 2, name: 'P2', agent: 'tester' }),
        ],
      },
      workspace
    );
    assert.equal(created.ok, true, created.error || '');

    const frontmatter = readSessionFrontmatter(workspace);
    assert.equal(frontmatter.schema_version, 2);
    assert.equal(frontmatter.parent_session_id, null);
    assert.equal(frontmatter.branch, null);
    assert.equal(frontmatter.phases.length, 2);
    for (const phase of frontmatter.phases) {
      assert.equal(phase.blocker_count, 0);
      assert.equal(phase.review_finding_count, 0);
    }
  });
});
