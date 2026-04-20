'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createServer } = require('../../src/mcp/core/create-server');
const {
  createToolPack: createWorkspacePack,
} = require('../../src/mcp/tool-packs/workspace');
const {
  createToolPack: createSessionPack,
} = require('../../src/mcp/tool-packs/session');

describe('plan contract round-trip', () => {
  it('validate_plan output is accepted verbatim by create_session', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-plan-rt-'));

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createWorkspacePack, createSessionPack],
    });

    await server.callTool(
      'initialize_workspace',
      { workspace_path: workspace },
      workspace
    );

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

    const sessionPath = path.join(
      workspace,
      'docs',
      'maestro',
      'state',
      'active-session.md'
    );
    const raw = fs.readFileSync(sessionPath, 'utf8');
    const frontmatter = JSON.parse(raw.match(/^---\n([\s\S]*?)\n---/)[1]);
    assert.deepEqual(frontmatter.phases[0].planned_files, ['src/foo.js']);
    assert.deepEqual(frontmatter.phases[1].blocked_by, [1]);
    assert.equal(frontmatter.phases[1].parallel, true);
  });
});
