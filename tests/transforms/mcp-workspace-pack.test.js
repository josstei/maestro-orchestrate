import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { buildMcpServer, createWorkspacePack, makeTempWorkspace } from '../support/mcp.js';

async function buildWorkspaceServer(testContext) {
  return buildMcpServer({ testContext, toolPacks: [createWorkspacePack] });
}

describe('workspace tool pack', () => {
  it('registers the workspace and planning tool surface through the kernel', async (t) => {
    const server = await buildWorkspaceServer(t);

    const schemas = await server.getToolSchemas();
    assert.deepEqual(
      schemas.map((schema) => schema.name),
      [
        'initialize_workspace',
        'assess_task_complexity',
        'validate_plan',
        'resolve_settings',
      ]
    );
  });

  it('resolves settings from the workspace env file', async (t) => {
    const projectRoot = makeTempWorkspace('maestro-settings-', t);
    fs.writeFileSync(
      path.join(projectRoot, '.env'),
      'MAESTRO_DISABLED_AGENTS=architect, tester\n'
    );

    const server = await buildWorkspaceServer(t);
    const init = await server.callTool('initialize_workspace', { workspace_path: projectRoot });
    assert.equal(init.ok, true);

    const result = await server.callTool('resolve_settings', {
      settings: ['MAESTRO_DISABLED_AGENTS'],
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.result.settings.MAESTRO_DISABLED_AGENTS,
      'architect, tester'
    );
    assert.deepEqual(result.result.disabled_agents, ['architect', 'tester']);
  });

  it('initializes the workspace directories under the provided project root', async (t) => {
    const projectRoot = makeTempWorkspace('maestro-workspace-', t);
    const server = await buildWorkspaceServer(t);

    const result = await server.callTool('initialize_workspace', {
      workspace_path: projectRoot,
      state_dir: 'docs/maestro',
    });

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

  it('reports overlapping files for parallel phases', async (t) => {
    const server = await buildWorkspaceServer(t);

    const result = await server.callTool('validate_plan', {
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
    });

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
