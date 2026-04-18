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

function createServerForWorkspace() {
  return createServer({
    runtimeConfig: { name: 'gemini' },
    services: {},
    toolPacks: [createWorkspacePack, createSessionPack],
  });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

describe('design document lifecycle: plan-mode tmp -> state_dir/plans -> archive', () => {
  it('record_design_approval copies design doc into state_dir/plans/ when Plan Mode wrote it elsewhere', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-ws-'));
    const planModeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-tmp-'));
    const tmpDesignPath = path.join(planModeTmp, 'plans', 'design.md');
    writeFile(tmpDesignPath, '# Approved Design\n');

    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool(
      'enter_design_gate',
      { session_id: 'ddl-1' },
      workspace
    );

    const approval = await server.callTool(
      'record_design_approval',
      { session_id: 'ddl-1', design_document_path: tmpDesignPath },
      workspace
    );

    assert.equal(approval.ok, true);
    const canonicalPath = path.join(workspace, 'docs', 'maestro', 'plans', 'design.md');
    assert.equal(approval.result.design_document_path, canonicalPath);
    assert.equal(fs.existsSync(canonicalPath), true, 'doc should be copied into plans/');
    assert.equal(fs.existsSync(tmpDesignPath), true, 'source doc should remain intact in Plan Mode tmp');
  });

  it('create_session auto-populates state.design_document from the design gate when the param is omitted', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-auto-'));
    const planModeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-auto-tmp-'));
    const tmpDesignPath = path.join(planModeTmp, 'plans', 'auto-design.md');
    writeFile(tmpDesignPath, '# Auto Design\n');

    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'ddl-auto' }, workspace);
    await server.callTool(
      'record_design_approval',
      { session_id: 'ddl-auto', design_document_path: tmpDesignPath },
      workspace
    );

    const create = await server.callTool(
      'create_session',
      {
        session_id: 'ddl-auto',
        task: 'auto lifecycle',
        task_complexity: 'simple',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['index.html'] },
        ],
      },
      workspace
    );
    assert.equal(create.ok, true);

    const stateRaw = fs.readFileSync(
      path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md'),
      'utf8'
    );
    const state = JSON.parse(stateRaw.split('---')[1].trim());
    assert.equal(
      state.design_document,
      path.join(workspace, 'docs', 'maestro', 'plans', 'auto-design.md')
    );
  });

  it('archive_session moves both the auto-populated design doc and the implementation plan to plans/archive/', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-archive-'));
    const planModeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-archive-tmp-'));
    const tmpDesignPath = path.join(planModeTmp, 'plans', 'design.md');
    const tmpPlanPath = path.join(planModeTmp, 'plans', 'impl-plan.md');
    writeFile(tmpDesignPath, '# Design\n');
    writeFile(tmpPlanPath, '# Plan\n');

    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'ddl-arc' }, workspace);
    await server.callTool(
      'record_design_approval',
      { session_id: 'ddl-arc', design_document_path: tmpDesignPath },
      workspace
    );
    await server.callTool(
      'create_session',
      {
        session_id: 'ddl-arc',
        task: 'archive lifecycle',
        task_complexity: 'simple',
        implementation_plan: tmpPlanPath,
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['index.html'] },
        ],
      },
      workspace
    );
    await server.callTool(
      'transition_phase',
      {
        session_id: 'ddl-arc',
        completed_phase_id: 1,
        files_created: ['index.html'],
        downstream_context: { integration_points: 'index.html created' },
      },
      workspace
    );

    const archive = await server.callTool(
      'archive_session',
      { session_id: 'ddl-arc' },
      workspace
    );
    assert.equal(archive.ok, true);
    const archiveRoot = path.join(workspace, 'docs', 'maestro');
    const archivedSession = path.join(archiveRoot, 'state', 'archive', 'ddl-arc.md');
    const archivedDesign = path.join(archiveRoot, 'plans', 'archive', 'design.md');
    const archivedPlan = path.join(archiveRoot, 'plans', 'archive', 'impl-plan.md');

    assert.deepEqual(
      archive.result.archived_files.sort(),
      [archivedDesign, archivedPlan, archivedSession].sort()
    );
    assert.equal(fs.existsSync(archivedSession), true);
    assert.equal(fs.existsSync(archivedDesign), true);
    assert.equal(fs.existsSync(archivedPlan), true);
  });

  it('persists explicit implementation_plan params that already live in plans/ without copying', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-inplace-'));
    const plansDir = path.join(workspace, 'docs', 'maestro', 'plans');
    const planPath = path.join(plansDir, 'inplace-plan.md');
    writeFile(planPath, '# Inplace Plan\n');

    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    const create = await server.callTool(
      'create_session',
      {
        session_id: 'ddl-inplace',
        task: 'in-place plan',
        task_complexity: 'simple',
        implementation_plan: planPath,
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['foo.txt'] },
        ],
      },
      workspace
    );
    assert.equal(create.ok, true);

    const stateRaw = fs.readFileSync(
      path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md'),
      'utf8'
    );
    const state = JSON.parse(stateRaw.split('---')[1].trim());
    assert.equal(state.implementation_plan, planPath);
  });
});
