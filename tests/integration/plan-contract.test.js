'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { readSessionState } = require('../support/session-file');
const { SessionWorkspace, phase } = require('../support/session-server');

describe('plan contract round-trip', () => {
  it('validate_plan output is accepted verbatim by create_session', async () => {
    const workspace = await SessionWorkspace.create();

    const plan = {
      phases: [
        phase(1, { name: 'Scaffold', files: ['src/foo.js'] }),
        phase(2, { name: 'Test', agent: 'tester', parallel: true, blocked_by: [1], files: ['tests/foo.test.js'] }),
      ],
    };

    const valid = await workspace.call('validate_plan', { plan, task_complexity: 'simple' });
    assert.equal(valid.ok, true);
    assert.equal(valid.result.valid, true);

    const created = await workspace.createSession('rt-1', { task_complexity: 'simple', phases: plan.phases });
    assert.equal(created.ok, true);

    const frontmatter = readSessionState(workspace.dir);
    assert.deepEqual(frontmatter.phases[0].planned_files, ['src/foo.js']);
    assert.deepEqual(frontmatter.phases[1].blocked_by, [1]);
    assert.equal(frontmatter.phases[1].parallel, true);
  });
});
