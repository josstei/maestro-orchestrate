'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createServer } = require('../../src/mcp/core/create-server');
const { createProjectRootCache } = require('../../src/mcp/core/project-root-cache');
const { tools: workspaceTools } = require('../../src/mcp/tools/workspace');
const { tools: sessionTools } = require('../../src/mcp/tools/session');
const { tools: contentTools } = require('../../src/mcp/tools/content');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { makeTempDir } = require('../support/fs');

function createFullServer() {
  const runtimeConfig = getRuntimeConfig('qwen');
  return createServer({
    runtimeConfig,
    workspace: createProjectRootCache({ runtimeConfig, requestClientRoots: async () => ({}) }),
    tools: [...workspaceTools, ...sessionTools, ...contentTools],
  });
}

describe('workspace requirement contract', () => {
  it('returns typed WORKSPACE_NOT_INITIALIZED error when workspace-dependent tools are called without a workspace', async () => {
    const server = createFullServer();
    const workspaceDependentTools = [
      { name: 'create_session', args: { session_id: 's1', task: 't', phases: [] } },
      { name: 'get_session_status', args: {} },
      { name: 'transition_phase', args: { session_id: 's1', completed_phase_id: 1 } },
      { name: 'archive_session', args: { session_id: 's1' } },
      { name: 'update_session', args: { session_id: 's1' } },
      { name: 'enter_design_gate', args: { session_id: 's1' } },
      { name: 'record_design_approval', args: { session_id: 's1', design_document_path: '/tmp/x.md' } },
      { name: 'get_design_gate_status', args: { session_id: 's1' } },
      { name: 'scan_phase_changes', args: { session_id: 's1', phase_id: 1 } },
      { name: 'reconcile_phase', args: { session_id: 's1', phase_id: 1 } },
      { name: 'assess_task_complexity', args: {} },
    ];

    for (const tool of workspaceDependentTools) {
      const result = await server.callTool(tool.name, tool.args, null);
      assert.equal(
        result.ok,
        false,
        `${tool.name} should reject when projectRoot is null`
      );
      assert.equal(
        result.code,
        'WORKSPACE_NOT_INITIALIZED',
        `${tool.name} should return WORKSPACE_NOT_INITIALIZED, got ${result.code}`
      );
      assert.match(
        result.error,
        /initialize_workspace/,
        `${tool.name} error must point the caller to initialize_workspace`
      );
    }
  });

  it('startup-phase tools succeed without a workspace (resolve_settings, get_runtime_context, get_skill_content, get_agent, initialize_workspace itself)', async () => {
    const server = createFullServer();

    const settings = await server.callTool('resolve_settings', {}, null);
    assert.equal(settings.ok, true, `resolve_settings must tolerate null projectRoot: ${settings.error || ''}`);
    assert.ok(settings.result.settings, 'resolve_settings should return settings object');

    const runtime = await server.callTool('get_runtime_context', {}, null);
    assert.equal(runtime.ok, true, `get_runtime_context must tolerate null projectRoot: ${runtime.error || ''}`);

    const skills = await server.callTool('get_skill_content', { resources: ['architecture'] }, null);
    assert.equal(skills.ok, true, `get_skill_content must tolerate null projectRoot: ${skills.error || ''}`);

    const agents = await server.callTool('get_agent', { agents: ['coder'] }, null);
    assert.equal(agents.ok, true, `get_agent must tolerate null projectRoot: ${agents.error || ''}`);
  });

  it('workspace-dependent tools succeed after initialize_workspace provides a workspace', async () => {
    const workspace = makeTempDir('maestro-wr-');
    const server = createFullServer();

    const init = await server.callTool(
      'initialize_workspace',
      { workspace_path: workspace },
      workspace
    );
    assert.equal(init.ok, true);

    const status = await server.callTool('get_session_status', {}, workspace);
    assert.equal(status.ok, true);
    assert.equal(status.result.exists, false);
  });
});

// Installed-plugin directories per host, relative to the home directory.
const HOST_PLUGIN_DIRS = [
  { host: 'codex', label: 'a codex plugin cache', segments: ['.codex', 'plugins', 'maestro'] },
  { host: 'claude', label: 'a claude plugin cache', segments: ['.claude', 'plugins', 'maestro'] },
  {
    host: 'antigravity',
    label: 'an antigravity plugin install',
    segments: ['.gemini', 'config', 'plugins', 'maestro'],
  },
  {
    host: 'antigravity-cli',
    label: 'the older antigravity-cli plugin directory',
    segments: ['.gemini', 'antigravity-cli', 'plugins', 'maestro'],
  },
];

describe('initialize_workspace contract', () => {
  for (const { host, label, segments } of HOST_PLUGIN_DIRS) {
    it(`rejects initialize_workspace with a path inside ${label}`, async () => {
      const cacheParent = makeTempDir(`${host}-cache-parent-`);
      const cache = path.join(cacheParent, ...segments);
      fs.mkdirSync(cache, { recursive: true });

      const server = createFullServer();

      const outcome = await server.callTool(
        'initialize_workspace',
        { workspace_path: cache },
        cache
      );
      assert.equal(outcome.ok, false);
      assert.match(outcome.error || '', /extension cache/i);
    });
  }

  it('rejects initialize_workspace with a missing workspace_path', async () => {
    const server = createFullServer();

    const outcome = await server.callTool(
      'initialize_workspace',
      {},
      null
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /workspace|required|initialize/i);
  });
});
