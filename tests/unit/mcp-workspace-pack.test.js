'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createToolPack } = require('../../src/mcp/tool-packs/workspace');
const { withEnv } = require('../support/env');
const { makeTempDir } = require('../support/fs');
const { packServer, phase } = require('../support/session-server');

describe('workspace tool pack', () => {
  it('registers the workspace and planning tool surface through the kernel', () => {
    const server = packServer([createToolPack]);

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

    const server = packServer([createToolPack]);

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

    const server = packServer([createToolPack]);

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
    const server = packServer([createToolPack]);

    const result = await server.callTool(
      'validate_plan',
      {
        task_complexity: 'complex',
        plan: {
          phases: [
            phase(1, { files_modified: ['src/shared.js'] }),
            phase(2, { parallel: true, blocked_by: [1], files_modified: ['src/conflict.js'] }),
            phase(3, { parallel: true, blocked_by: [1], files_modified: ['src/conflict.js'] }),
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
