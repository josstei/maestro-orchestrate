'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createInitializedSessionServer,
  readSessionState,
} = require('../support/session-server');

describe('plan contract round-trip', () => {
  it('validate_plan output is accepted verbatim by create_session', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-plan-rt-'));

    const server = await createInitializedSessionServer(workspace);

    const plan = {
      phases: [
        {
          id: 1,
          name: 'Scaffold',
          agent: 'coder',
          parallel: false,
          blocked_by: [],
          files: ['src/foo.js'],
        },
        {
          id: 2,
          name: 'Test',
          agent: 'tester',
          parallel: true,
          blocked_by: [1],
          files: ['tests/foo.test.js'],
        },
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

    const frontmatter = readSessionState(workspace);
    assert.deepEqual(frontmatter.phases[0].planned_files, ['src/foo.js']);
    assert.deepEqual(frontmatter.phases[1].blocked_by, [1]);
    assert.equal(frontmatter.phases[1].parallel, true);
  });
});
