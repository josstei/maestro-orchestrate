'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createInitializedMcpWorkspace,
  phaseFixture,
  readSessionFrontmatter,
} = require('../support/mcp');

describe('plan contract round-trip', () => {
  it('validate_plan output is accepted verbatim by create_session', async () => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'maestro-plan-rt-',
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
});
