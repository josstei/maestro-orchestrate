import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildMcpServer,
  createContentPack,
  createHistoryPack,
  createInitializedMcpWorkspace,
  createMemoryPack,
  createSessionPack,
  createWorkspacePack,
  makeTempWorkspace,
  phaseFixture,
  readSessionFrontmatter,
} from '../support/mcp.js';

async function createFullServer(testContext) {
  return buildMcpServer({
    runtime: 'gemini',
    testContext,
    toolPacks: [createWorkspacePack, createSessionPack, createContentPack, createMemoryPack, createHistoryPack],
  });
}

describe('workspace requirement contract', () => {
  it('returns typed WORKSPACE_NOT_INITIALIZED error when workspace-dependent tools are called without a workspace', async (t) => {
    const server = await createFullServer(t);
    const workspaceDependentTools = [
      { name: 'create_session', args: { session_id: 's1', task: 't', phases: [phaseFixture()] } },
      { name: 'get_session_status', args: {} },
      { name: 'transition_phase', args: { session_id: 's1', completed_phase_id: 1 } },
      { name: 'archive_session', args: { session_id: 's1' } },
      { name: 'update_session', args: { session_id: 's1' } },
      { name: 'enter_design_gate', args: { session_id: 's1' } },
      { name: 'record_design_approval', args: { session_id: 's1', design_document_path: '/tmp/x.md' } },
      { name: 'get_design_gate_status', args: { session_id: 's1' } },
      { name: 'scan_phase_changes', args: { session_id: 's1', phase_id: 1 } },
      { name: 'reconcile_phase', args: { session_id: 's1', phase_id: 1 } },
      { name: 'search_archived_sessions', args: {} },
      { name: 'get_cost_insights', args: {} },
      { name: 'assess_task_complexity', args: {} },
      { name: 'get_project_profile', args: {} },
      { name: 'update_project_profile', args: {} },
      { name: 'record_validation_commands', args: { commands: {} } },
      { name: 'get_agent_performance', args: {} },
      { name: 'recall_similar_sessions', args: { query: 'typed command tables' } },
      { name: 'rate', args: { target: 'session', session_id: 's1', rating: 'up' } },
      { name: 'get_plan_accuracy', args: {} },
      { name: 'query_architecture_memory', args: {} },
      { name: 'get_agent_memory', args: { agent: 'tester' } },
      { name: 'append_agent_memory', args: { agent: 'tester', note: 'workspace gate proof' } },
      { name: 'compact_archive', args: {} },
      { name: 'record_knowledge', args: { topic: 'workspace gate', note: 'must reject first' } },
      { name: 'query_knowledge', args: {} },
      { name: 'export_memory_pack', args: {} },
      { name: 'import_memory_pack', args: {} },
      { name: 'fork_session', args: { source_session_id: 's1', new_session_id: 's2' } },
      { name: 'list_lineage', args: { session_id: 's1' } },
      { name: 'list_checkpoints', args: { session_id: 's1' } },
      { name: 'restore_checkpoint', args: { session_id: 's1', phase_id: 1 } },
      { name: 'list_session_blueprints', args: {} },
      {
        name: 'instantiate_session_blueprint',
        args: { blueprint_id: 'default', task: 'prove workspace gate runs before blueprint handler' },
      },
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

  it('startup-phase tools succeed without a workspace', async (t) => {
    const server = await createFullServer(t);

    const settings = await server.callTool('resolve_settings', {}, null);
    assert.equal(settings.ok, true, `resolve_settings must tolerate null projectRoot: ${settings.error || ''}`);
    assert.ok(settings.result.settings, 'resolve_settings should return settings object');

    const runtime = await server.callTool('get_runtime_context', {}, null);
    assert.equal(runtime.ok, true, `get_runtime_context must tolerate null projectRoot: ${runtime.error || ''}`);

    const skills = await server.callTool('get_skill_content', { resources: ['architecture'] }, null);
    assert.equal(skills.ok, true, `get_skill_content must tolerate null projectRoot: ${skills.error || ''}`);

    const agents = await server.callTool('get_agent', { agents: ['coder'] }, null);
    assert.equal(agents.ok, true, `get_agent must tolerate null projectRoot: ${agents.error || ''}`);

    const plan = await server.callTool('validate_plan', {
      plan: { phases: [] },
      task_complexity: 'complex',
    }, null);
    assert.equal(plan.ok, true, `validate_plan must tolerate null projectRoot: ${plan.error || ''}`);
  });

  it('workspace-dependent tools succeed after initialize_workspace provides a workspace', async (t) => {
    const { workspace, server, init } = await createInitializedMcpWorkspace({
      prefix: 'maestro-wr-',
      runtime: 'gemini',
      testContext: t,
      toolPacks: [createWorkspacePack, createSessionPack, createContentPack],
    });
    assert.equal(init.ok, true);

    const status = await server.callTool('get_session_status', {}, workspace);
    assert.equal(status.ok, true);
    assert.equal(status.result.exists, false);
  });

  it('uses the initialized workspace state directory for later session writes', async (t) => {
    const workspace = makeTempWorkspace('maestro-custom-state-dir-', t);
    fs.writeFileSync(
      path.join(workspace, '.env'),
      'MAESTRO_STATE_DIR=custom/maestro\n'
    );
    const server = await buildMcpServer({
      runtime: 'gemini',
      testContext: t,
      toolPacks: [createWorkspacePack, createSessionPack],
    });

    const initialized = await server.callTool('initialize_workspace', {
      workspace_path: workspace,
    });
    assert.equal(initialized.ok, true);
    assert.equal(initialized.result.state_dir, 'custom/maestro');

    const created = await server.callTool('create_session', {
      session_id: 'custom-state-dir',
      task: 'prove initialized state directory authority',
      phases: [phaseFixture()],
    });
    assert.equal(created.ok, true, created.error || '');
    assert.equal(
      created.result.path,
      path.join(workspace, 'custom/maestro/state/active-session.md')
    );
    assert.equal(fs.existsSync(created.result.path), true);
    assert.equal(
      fs.existsSync(path.join(workspace, 'docs/maestro/state/active-session.md')),
      false
    );
  });

  it('isolates authoritative state directories between server instances', async (t) => {
    const workspace = makeTempWorkspace('maestro-isolated-state-dirs-', t);
    const serverA = await buildMcpServer({
      runtime: 'gemini',
      testContext: t,
      toolPacks: [createWorkspacePack, createSessionPack],
    });
    const serverB = await buildMcpServer({
      runtime: 'gemini',
      testContext: t,
      toolPacks: [createWorkspacePack, createSessionPack],
    });

    const initializedA = await serverA.callTool('initialize_workspace', {
      workspace_path: workspace,
      state_dir: 'state-a',
    });
    const initializedB = await serverB.callTool('initialize_workspace', {
      workspace_path: workspace,
      state_dir: 'state-b',
    });
    assert.equal(initializedA.ok, true);
    assert.equal(initializedB.ok, true);

    const createdA = await serverA.callTool('create_session', {
      session_id: 'server-a',
      task: 'keep server A state isolated',
      phases: [phaseFixture()],
    });
    const createdB = await serverB.callTool('create_session', {
      session_id: 'server-b',
      task: 'keep server B state isolated',
      phases: [phaseFixture()],
    });

    assert.equal(createdA.ok, true, createdA.error || '');
    assert.equal(createdB.ok, true, createdB.error || '');
    assert.equal(createdA.result.path, path.join(workspace, 'state-a/state/active-session.md'));
    assert.equal(createdB.result.path, path.join(workspace, 'state-b/state/active-session.md'));
  });

  it('rejects a state child directory replaced by a symlink after initialization', async (t) => {
    const workspace = makeTempWorkspace('maestro-replaced-state-child-', t);
    const outside = makeTempWorkspace('maestro-replaced-state-child-outside-', t);
    const server = await buildMcpServer({
      runtime: 'gemini',
      testContext: t,
      toolPacks: [createWorkspacePack, createSessionPack],
    });
    const initialized = await server.callTool('initialize_workspace', {
      workspace_path: workspace,
      state_dir: 'custom-state',
    });
    assert.equal(initialized.ok, true);

    const statePath = path.join(workspace, 'custom-state', 'state');
    fs.rmSync(statePath, { recursive: true, force: true });
    fs.symlinkSync(outside, statePath, 'dir');

    const created = await server.callTool('create_session', {
      session_id: 'replaced-state-child',
      task: 'reject redirected state writes',
      phases: [phaseFixture()],
    });

    assert.equal(created.ok, false);
    assert.match(created.error || '', /symbolic links/);
    assert.equal(fs.existsSync(path.join(outside, 'active-session.md')), false);
  });

  it('rejects archive directories replaced by symlinks after initialization', async (t) => {
    for (const [index, relativeArchive] of ['state/archive', 'plans/archive'].entries()) {
      const workspace = makeTempWorkspace(`maestro-replaced-archive-${index}-`, t);
      const outside = makeTempWorkspace(`maestro-replaced-archive-outside-${index}-`, t);
      const server = await buildMcpServer({
        runtime: 'gemini',
        testContext: t,
        toolPacks: [createWorkspacePack, createSessionPack],
      });
      const initialized = await server.callTool('initialize_workspace', {
        workspace_path: workspace,
        state_dir: 'custom-state',
      });
      assert.equal(initialized.ok, true);
      const created = await server.callTool('create_session', {
        session_id: `replaced-archive-${index}`,
        task: 'reject redirected archive writes',
        phases: [phaseFixture()],
      });
      assert.equal(created.ok, true, created.error || '');

      const archivePath = path.join(workspace, 'custom-state', relativeArchive);
      fs.rmSync(archivePath, { recursive: true, force: true });
      fs.symlinkSync(outside, archivePath, 'dir');

      const archived = await server.callTool('archive_session', {
        session_id: `replaced-archive-${index}`,
      });
      assert.equal(archived.ok, false);
      assert.match(archived.error || '', /symbolic links/);
      assert.deepEqual(fs.readdirSync(outside), []);
    }
  });

  it('resolves the initialized workspace root even when process.cwd()/ambient env point elsewhere (discriminating test for the injected projectRoot seam)', async (t) => {
    const { workspace, server, init } = await createInitializedMcpWorkspace({
      prefix: 'maestro-wr-discriminating-',
      runtime: 'gemini',
      testContext: t,
      toolPacks: [createWorkspacePack, createSessionPack, createContentPack],
    });
    assert.equal(init.ok, true);
    assert.notEqual(workspace, process.cwd());

    const decoyEnv = { CLAUDE_PROJECT_DIR: '/definitely/not/the/workspace', PWD: '/also/not/it', INIT_CWD: '/nope' };
    const originalValues = {};
    for (const [key, value] of Object.entries(decoyEnv)) {
      originalValues[key] = process.env[key];
      process.env[key] = value;
    }

    try {
      const created = await server.callTool('create_session', {
        session_id: 'discriminating-1',
        task: 'prove projectRoot threading ignores ambient env/cwd',
        phases: [phaseFixture()],
      });
      assert.equal(created.ok, true, created.error || '');

      const status = await server.callTool('get_session_status', {});
      assert.equal(status.ok, true);
      assert.equal(status.result.exists, true);

      const written = readSessionFrontmatter(workspace);
      assert.equal(written.session_id, 'discriminating-1');
    } finally {
      for (const [key, value] of Object.entries(originalValues)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
