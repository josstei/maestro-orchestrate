const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createServer } = require('../../src/mcp/core/create-server');
const { createToolPack } = require('../../src/mcp/tool-packs/workspace');

const envKeysToRestore = [
  'MAESTRO_DISABLED_AGENTS',
  'MAESTRO_EXECUTION_MODE',
  'MAESTRO_EXTENSION_PATH',
];

const originalEnv = Object.fromEntries(
  envKeysToRestore.map((key) => [key, process.env[key]])
);

afterEach(() => {
  for (const key of envKeysToRestore) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

describe('workspace tool pack', () => {
  it('registers the workspace and planning tool surface through the kernel', () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

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
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-settings-'));
    fs.writeFileSync(
      path.join(projectRoot, '.env'),
      'MAESTRO_DISABLED_AGENTS=architect, tester\n'
    );

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    const result = await server.callTool(
      'resolve_settings',
      { settings: ['MAESTRO_DISABLED_AGENTS'] },
      projectRoot
    );

    assert.equal(result.ok, true);
    assert.equal(
      result.result.settings.MAESTRO_DISABLED_AGENTS,
      'architect, tester'
    );
    assert.deepEqual(result.result.disabled_agents, ['architect', 'tester']);
  });

  it('initializes the workspace directories under the provided project root', async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'maestro-workspace-')
    );

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

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
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

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
