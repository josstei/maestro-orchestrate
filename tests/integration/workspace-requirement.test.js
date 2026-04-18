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
const {
  createToolPack: createContentPack,
} = require('../../src/mcp/tool-packs/content');

function createFullServer() {
  return createServer({
    runtimeConfig: { name: 'gemini' },
    services: {},
    toolPacks: [createWorkspacePack, createSessionPack, createContentPack],
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
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-wr-'));
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
