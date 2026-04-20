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
  it('record_design_approval records the path without requiring the file to exist (Plan Mode parallel-dispatch tolerance)', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-ws-'));
    const planModeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-tmp-'));
    const tmpDesignPath = path.join(planModeTmp, 'plans', 'design.md');

    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'ddl-1' }, workspace);

    const approval = await server.callTool(
      'record_design_approval',
      { session_id: 'ddl-1', design_document_path: tmpDesignPath },
      workspace
    );

    assert.equal(
      approval.ok,
      true,
      'approval must succeed even when the source file has not yet materialized on disk'
    );
    assert.equal(approval.result.design_document_path, tmpDesignPath);
    assert.equal(
      fs.existsSync(path.join(workspace, 'docs', 'maestro', 'plans', 'design.md')),
      false,
      'no copy should occur at approval time'
    );
  });

  it('create_session materializes the design doc from the gate path once it exists on disk', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-latewrite-'));
    const planModeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-latewrite-tmp-'));
    const tmpDesignPath = path.join(planModeTmp, 'plans', 'design.md');

    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'ddl-late' }, workspace);
    await server.callTool(
      'record_design_approval',
      { session_id: 'ddl-late', design_document_path: tmpDesignPath },
      workspace
    );

    writeFile(tmpDesignPath, '# Design (written after approval)\n');

    const create = await server.callTool(
      'create_session',
      {
        session_id: 'ddl-late',
        task: 'late materialize',
        task_complexity: 'simple',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['index.html'] },
        ],
      },
      workspace
    );
    assert.equal(create.ok, true);

    const canonicalPath = path.join(workspace, 'docs', 'maestro', 'plans', 'design.md');
    assert.equal(fs.existsSync(canonicalPath), true, 'create_session should copy the design doc into plans/');
    assert.equal(fs.existsSync(tmpDesignPath), true, 'Plan Mode tmp copy must remain intact');
  });

  it('create_session surfaces a sequenced NOT_FOUND error when the approved design doc never materialized', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-missing-'));
    const phantomPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-missing-tmp-')),
      'plans',
      'never-written.md'
    );

    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'ddl-missing' }, workspace);
    await server.callTool(
      'record_design_approval',
      { session_id: 'ddl-missing', design_document_path: phantomPath },
      workspace
    );

    const create = await server.callTool(
      'create_session',
      {
        session_id: 'ddl-missing',
        task: 'phantom design',
        task_complexity: 'simple',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['index.html'] },
        ],
      },
      workspace
    );

    assert.equal(create.ok, false);
    assert.equal(create.code, 'NOT_FOUND');
    assert.match(create.error, /design_document does not exist/i);
    assert.match(
      create.error,
      /record_design_approval.*create_session/,
      'error must name both endpoints so the caller understands the sequence'
    );
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
    assert.equal(
      fs.existsSync(state.design_document),
      true,
      'create_session should have materialized the doc from the gate'
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

  it('archive_session removes the design-gate artifact so reused session IDs start with a fresh gate', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-gate-cleanup-'));
    const designPath = path.join(workspace, 'docs', 'maestro', 'plans', 'design.md');
    writeFile(designPath, '# Design\n');

    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'ddl-cleanup' }, workspace);
    await server.callTool(
      'record_design_approval',
      { session_id: 'ddl-cleanup', design_document_path: designPath },
      workspace
    );

    const gatePath = path.join(
      workspace,
      'docs',
      'maestro',
      'state',
      'ddl-cleanup.design-gate.json'
    );
    assert.equal(fs.existsSync(gatePath), true, 'gate file exists during session');

    await server.callTool(
      'create_session',
      {
        session_id: 'ddl-cleanup',
        task: 'gate cleanup',
        task_complexity: 'simple',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['f.txt'] },
        ],
      },
      workspace
    );
    await server.callTool(
      'transition_phase',
      {
        session_id: 'ddl-cleanup',
        completed_phase_id: 1,
        files_created: ['f.txt'],
        downstream_context: { integration_points: 'f.txt' },
      },
      workspace
    );
    const archive = await server.callTool(
      'archive_session',
      { session_id: 'ddl-cleanup' },
      workspace
    );
    assert.equal(archive.ok, true);
    assert.equal(
      fs.existsSync(gatePath),
      false,
      'archive_session must remove the design-gate artifact'
    );

    const resumedGate = await server.callTool(
      'get_design_gate_status',
      { session_id: 'ddl-cleanup' },
      workspace
    );
    assert.equal(resumedGate.ok, true);
    assert.equal(resumedGate.result.entered_at, null, 'reused session id starts with a fresh gate');
    assert.equal(resumedGate.result.approved_at, null);
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

  it('content variant: record_design_approval + create_session materialize both docs without path resolution (Gemini Plan Mode flow)', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-content-'));
    const designBody = '# Design (inline)\n\nPassed as content.\n';
    const planBody = '# Plan (inline)\n\nPassed as content.\n';

    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
    await server.callTool('enter_design_gate', { session_id: 'ddl-content' }, workspace);

    const approval = await server.callTool(
      'record_design_approval',
      {
        session_id: 'ddl-content',
        design_document_content: designBody,
        design_document_filename: 'design-content.md',
      },
      workspace
    );
    assert.equal(approval.ok, true);
    const canonicalDesign = path.join(
      workspace,
      'docs',
      'maestro',
      'plans',
      'design-content.md'
    );
    assert.equal(approval.result.design_document_path, canonicalDesign);
    assert.equal(fs.readFileSync(canonicalDesign, 'utf8'), designBody);

    const create = await server.callTool(
      'create_session',
      {
        session_id: 'ddl-content',
        task: 'content lifecycle',
        task_complexity: 'simple',
        implementation_plan_content: planBody,
        implementation_plan_filename: 'plan-content.md',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['x.txt'] },
        ],
      },
      workspace
    );
    assert.equal(create.ok, true);

    const canonicalPlan = path.join(
      workspace,
      'docs',
      'maestro',
      'plans',
      'plan-content.md'
    );
    assert.equal(fs.readFileSync(canonicalPlan, 'utf8'), planBody);

    const stateRaw = fs.readFileSync(
      path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md'),
      'utf8'
    );
    const state = JSON.parse(stateRaw.split('---')[1].trim());
    assert.equal(state.design_document, canonicalDesign);
    assert.equal(state.implementation_plan, canonicalPlan);

    await server.callTool(
      'transition_phase',
      {
        session_id: 'ddl-content',
        completed_phase_id: 1,
        files_created: ['x.txt'],
        downstream_context: { integration_points: 'x.txt' },
      },
      workspace
    );
    const archive = await server.callTool(
      'archive_session',
      { session_id: 'ddl-content' },
      workspace
    );
    assert.equal(archive.ok, true);
    const archiveRoot = path.join(workspace, 'docs', 'maestro');
    assert.deepEqual(
      archive.result.archived_files.sort(),
      [
        path.join(archiveRoot, 'plans', 'archive', 'design-content.md'),
        path.join(archiveRoot, 'plans', 'archive', 'plan-content.md'),
        path.join(archiveRoot, 'state', 'archive', 'ddl-content.md'),
      ].sort()
    );
  });

  it('create_session rejects both implementation_plan variants supplied together', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-planmutex-'));
    const plansDir = path.join(workspace, 'docs', 'maestro', 'plans');
    const planPath = path.join(plansDir, 'plan.md');
    writeFile(planPath, '# Plan\n');

    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

    const create = await server.callTool(
      'create_session',
      {
        session_id: 'ddl-planmutex',
        task: 'plan mutex',
        task_complexity: 'simple',
        implementation_plan: planPath,
        implementation_plan_content: '# Plan\n',
        implementation_plan_filename: 'plan.md',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['x.txt'] },
        ],
      },
      workspace
    );
    assert.equal(create.ok, false);
    assert.match(create.error || '', /mutually exclusive/i);
  });

  it('create_session rejects incomplete implementation_plan content variant (missing filename)', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-planincomplete-'));
    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

    const create = await server.callTool(
      'create_session',
      {
        session_id: 'ddl-planincomplete',
        task: 'plan partial',
        task_complexity: 'simple',
        implementation_plan_content: '# Plan\n',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['x.txt'] },
        ],
      },
      workspace
    );
    assert.equal(create.ok, false);
    assert.match(create.error || '', /implementation_plan_filename is required/i);
  });

  it('create_session accepts no implementation plan (at-most-one-of semantics permits neither)', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ddl-noplan-'));
    const server = createServerForWorkspace();
    await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

    const create = await server.callTool(
      'create_session',
      {
        session_id: 'ddl-noplan',
        task: 'no plan',
        task_complexity: 'simple',
        phases: [
          { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['x.txt'] },
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
    assert.equal(state.implementation_plan, null);
  });
});
