import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInitializedMcpWorkspace, phaseFixture, readSessionFrontmatter, writeWorkspaceFile } from '../support/mcp.js';
import fs from 'node:fs';
import path from 'node:path';

describe('plan contract round-trip and path variants', () => {
  it('validate_plan output is accepted verbatim by create_session', async (t) => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'maestro-plan-rt-',
      testContext: t,
    });

    const plan = {
      phases: [
        phaseFixture({
          name: 'Scaffold',
          files: ['src/foo.js'],
        }),
        phaseFixture({
          id: 2,
          name: 'Test',
          agent: 'tester',
          parallel: true,
          blocked_by: [1],
          files: ['tests/foo.test.js'],
        }),
      ],
    };

    const valid = await server.callTool(
      'validate_plan',
      { plan, task_complexity: 'simple' },
      workspace
    );
    assert.equal(valid.ok, true);
    assert.equal(valid.result.valid, true);

    const created = await server.callTool(
      'create_session',
      {
        session_id: 'rt-1',
        task: 'round-trip test',
        task_complexity: 'simple',
        phases: plan.phases,
      },
      workspace
    );
    assert.equal(created.ok, true);

    const frontmatter = readSessionFrontmatter(workspace);
    assert.deepEqual(frontmatter.phases[0].planned_files, ['src/foo.js']);
    assert.deepEqual(frontmatter.phases[1].blocked_by, [1]);
    assert.equal(frontmatter.phases[1].parallel, true);
  });

  it('handles implementation_plan path and content variants according to contract', async (t) => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'plan-variants-',
      testContext: t,
    });

    writeWorkspaceFile(workspace, 'custom-plan.md', '# Custom Plan Content\n');

    // 1. Existing workspace-relative path -> succeeds
    const pathSuccess = await server.callTool(
      'create_session',
      {
        session_id: 'path-sess-1',
        task: 'Path variant test',
        implementation_plan: 'custom-plan.md',
        phases: [phaseFixture()],
      },
      workspace
    );
    assert.equal(pathSuccess.ok, true);
    assert.equal(fs.existsSync(path.join(workspace, 'docs/maestro/plans/custom-plan.md')), true);

    // Transition & archive path-sess-1 so workspace is clear
    await server.callTool(
      'transition_phase',
      {
        session_id: 'path-sess-1',
        completed_phase_id: 1,
        files_created: ['docs/plan.md'],
        downstream_context: { key_interfaces_introduced: ['Plan'] },
      },
      workspace
    );
    await server.callTool('archive_session', { session_id: 'path-sess-1' }, workspace);

    // 2. Missing relative path -> STATE_ERROR
    const pathMissing = await server.callTool(
      'create_session',
      {
        session_id: 'path-sess-2',
        task: 'Missing path test',
        implementation_plan: 'non-existent-plan.md',
        phases: [phaseFixture()],
      },
      workspace
    );
    assert.equal(pathMissing.ok, false);
    assert.equal(pathMissing.code, 'NOT_FOUND');

    // 3. Inline content + safe filename -> succeeds
    const contentSuccess = await server.callTool(
      'create_session',
      {
        session_id: 'content-sess-1',
        task: 'Content variant test',
        implementation_plan_content: '# Inline Plan\n',
        implementation_plan_filename: 'inline-plan.md',
        phases: [phaseFixture()],
      },
      workspace
    );
    assert.equal(contentSuccess.ok, true);
    assert.equal(fs.existsSync(path.join(workspace, 'docs/maestro/plans/inline-plan.md')), true);

    // Transition & archive content-sess-1
    await server.callTool(
      'transition_phase',
      {
        session_id: 'content-sess-1',
        completed_phase_id: 1,
        files_created: ['docs/inline.md'],
        downstream_context: { key_interfaces_introduced: ['Inline'] },
      },
      workspace
    );
    await server.callTool('archive_session', { session_id: 'content-sess-1' }, workspace);

    // 4. Content without filename -> VALIDATION_ERROR
    const contentNoFilename = await server.callTool(
      'create_session',
      {
        session_id: 'content-sess-2',
        task: 'Content without filename',
        implementation_plan_content: '# Missing Filename\n',
        phases: [phaseFixture()],
      },
      workspace
    );
    assert.equal(contentNoFilename.ok, false);
    assert.equal(contentNoFilename.code, 'VALIDATION_ERROR');

    // 5. Both path and content -> VALIDATION_ERROR (mutually exclusive)
    const mutuallyExclusive = await server.callTool(
      'create_session',
      {
        session_id: 'content-sess-3',
        task: 'Mutually exclusive variants',
        implementation_plan: 'custom-plan.md',
        implementation_plan_content: '# Conflicts\n',
        implementation_plan_filename: 'conflict.md',
        phases: [phaseFixture()],
      },
      workspace
    );
    assert.equal(mutuallyExclusive.ok, false);
    assert.equal(mutuallyExclusive.code, 'VALIDATION_ERROR');
  });
});
