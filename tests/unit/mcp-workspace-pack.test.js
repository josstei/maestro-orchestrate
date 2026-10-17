'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createServer } = require('../../src/mcp/core/create-server');
const { createToolPack } = require('../../src/mcp/tool-packs/workspace');
const { withEnv } = require('../support/env');
const { makeTempDir } = require('../support/fs');

function createWorkspacePackServer() {
  return createServer({
    runtimeConfig: { name: 'codex' },
    services: {},
    toolPacks: [createToolPack],
  });
}

describe('workspace tool pack', () => {
  it('registers the workspace and planning tool surface through the kernel', () => {
    const server = createWorkspacePackServer();

    assert.deepEqual(
      server.getToolSchemas().map((schema) => schema.name),
      [
        'initialize_workspace',
        'assess_task_complexity',
        'validate_plan',
        'resolve_settings',
      ]
    );
  });

  it('resolves settings from the workspace env file', async () => {
    const projectRoot = makeTempDir('maestro-settings-');
    fs.writeFileSync(
      path.join(projectRoot, '.env'),
      'MAESTRO_DISABLED_AGENTS=architect, tester\n'
    );

    const server = createWorkspacePackServer();

    // An inherited MAESTRO_DISABLED_AGENTS would take precedence over the .env file.
    const result = await withEnv({ MAESTRO_DISABLED_AGENTS: null }, () =>
      server.callTool(
        'resolve_settings',
        { settings: ['MAESTRO_DISABLED_AGENTS'] },
        projectRoot
      )
    );

    assert.equal(result.ok, true);
    assert.equal(
      result.result.settings.MAESTRO_DISABLED_AGENTS,
      'architect, tester'
    );
    assert.deepEqual(result.result.disabled_agents, ['architect', 'tester']);
  });

  it('initializes the workspace directories under the provided project root', async () => {
    const projectRoot = makeTempDir('maestro-workspace-');

    const server = createWorkspacePackServer();

    const result = await server.callTool(
      'initialize_workspace',
      { state_dir: 'docs/maestro' },
      projectRoot
    );

    assert.equal(result.ok, true);
    assert.equal(result.result.state_dir, 'docs/maestro');
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'docs/maestro/state')),
      true
    );
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'docs/maestro/plans/archive')),
      true
    );
  });

  it('reports overlapping files for parallel phases', async () => {
    const server = createWorkspacePackServer();

    const result = await server.callTool(
      'validate_plan',
      {
        task_complexity: 'complex',
        plan: {
          phases: [
            {
              id: 1,
              name: 'Foundation',
              agent: 'coder',
              parallel: false,
              blocked_by: [],
              files_created: [],
              files_modified: ['src/shared.js'],
            },
            {
              id: 2,
              name: 'Phase A',
              agent: 'coder',
              parallel: true,
              blocked_by: [1],
              files_created: [],
              files_modified: ['src/conflict.js'],
            },
            {
              id: 3,
              name: 'Phase B',
              agent: 'coder',
              parallel: true,
              blocked_by: [1],
              files_created: [],
              files_modified: ['src/conflict.js'],
            },
          ],
        },
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.result.valid, false);
    assert.equal(
      result.result.violations.some(
        (violation) => violation.rule === 'file_overlap'
      ),
      true
    );
  });
});
