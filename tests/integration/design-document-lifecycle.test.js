'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { makeTempDir, writeFile } = require('../support/fs');
const { readSessionState } = require('../support/session-file');
const { SessionWorkspace, singlePhase } = require('../support/session-server');

// Plan Mode hosts write documents to a temp dir outside the workspace.
function planModePath(name) {
  return path.join(makeTempDir('maestro-ddl-tmp-'), 'plans', name);
}

function createSimpleSession(workspace, sessionId, file, overrides = {}) {
  return workspace.createSession(sessionId, { task_complexity: 'simple', phases: singlePhase([file]), ...overrides });
}

async function completeAndArchive(workspace, sessionId, file) {
  await workspace.transition(sessionId, 1, { files_created: [file], downstream_context: { integration_points: file } });
  return workspace.call('archive_session', { session_id: sessionId });
}

describe('design document lifecycle: plan-mode tmp -> state_dir/plans -> archive', () => {
  it('record_design_approval records the path without requiring the file to exist (Plan Mode parallel-dispatch tolerance)', async () => {
    const workspace = await SessionWorkspace.create();
    const tmpDesignPath = planModePath('design.md');

    const approval = await workspace.approve('ddl-1', { design_document_path: tmpDesignPath });

    assert.equal(
      approval.ok,
      true,
      'approval must succeed even when the source file has not yet materialized on disk'
    );
    assert.equal(approval.result.design_document_path, tmpDesignPath);
    assert.equal(
      fs.existsSync(path.join(workspace.dir, 'docs', 'maestro', 'plans', 'design.md')),
      false,
      'no copy should occur at approval time'
    );
  });

  it('create_session materializes the design doc from the gate path once it exists on disk', async () => {
    const workspace = await SessionWorkspace.create();
    const tmpDesignPath = planModePath('design.md');

    await workspace.approve('ddl-late', { design_document_path: tmpDesignPath });

    writeFile(tmpDesignPath, '# Design (written after approval)\n');

    const create = await createSimpleSession(workspace, 'ddl-late', 'index.html');
    assert.equal(create.ok, true);

    const canonicalPath = path.join(workspace.dir, 'docs', 'maestro', 'plans', 'design.md');
    assert.equal(fs.existsSync(canonicalPath), true, 'create_session should copy the design doc into plans/');
    assert.equal(fs.existsSync(tmpDesignPath), true, 'Plan Mode tmp copy must remain intact');
  });

  it('create_session surfaces a sequenced NOT_FOUND error when the approved design doc never materialized', async () => {
    const workspace = await SessionWorkspace.create();
    const phantomPath = planModePath('never-written.md');

    await workspace.approve('ddl-missing', { design_document_path: phantomPath });

    const create = await createSimpleSession(workspace, 'ddl-missing', 'index.html');

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
    const workspace = await SessionWorkspace.create();
    const tmpDesignPath = planModePath('auto-design.md');
    writeFile(tmpDesignPath, '# Auto Design\n');

    await workspace.approve('ddl-auto', { design_document_path: tmpDesignPath });

    const create = await createSimpleSession(workspace, 'ddl-auto', 'index.html');
    assert.equal(create.ok, true);

    const state = readSessionState(workspace.dir);
    assert.equal(
      state.design_document,
      path.join(workspace.dir, 'docs', 'maestro', 'plans', 'auto-design.md')
    );
    assert.equal(
      fs.existsSync(state.design_document),
      true,
      'create_session should have materialized the doc from the gate'
    );
  });

  it('archive_session moves both the auto-populated design doc and the implementation plan to plans/archive/', async () => {
    const workspace = await SessionWorkspace.create();
    const planModeTmp = makeTempDir('maestro-ddl-archive-tmp-');
    const tmpDesignPath = path.join(planModeTmp, 'plans', 'design.md');
    const tmpPlanPath = path.join(planModeTmp, 'plans', 'impl-plan.md');
    writeFile(tmpDesignPath, '# Design\n');
    writeFile(tmpPlanPath, '# Plan\n');

    await workspace.approve('ddl-arc', { design_document_path: tmpDesignPath });
    await createSimpleSession(workspace, 'ddl-arc', 'index.html', { implementation_plan: tmpPlanPath });

    const archive = await completeAndArchive(workspace, 'ddl-arc', 'index.html');
    assert.equal(archive.ok, true);
    const archiveRoot = path.join(workspace.dir, 'docs', 'maestro');
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
    const workspace = await SessionWorkspace.create();
    const designPath = path.join(workspace.dir, 'docs', 'maestro', 'plans', 'design.md');
    writeFile(designPath, '# Design\n');

    await workspace.approve('ddl-cleanup', { design_document_path: designPath });

    const gatePath = path.join(
      workspace.dir,
      'docs',
      'maestro',
      'state',
      'ddl-cleanup.design-gate.json'
    );
    assert.equal(fs.existsSync(gatePath), true, 'gate file exists during session');

    await createSimpleSession(workspace, 'ddl-cleanup', 'f.txt');
    const archive = await completeAndArchive(workspace, 'ddl-cleanup', 'f.txt');
    assert.equal(archive.ok, true);
    assert.equal(
      fs.existsSync(gatePath),
      false,
      'archive_session must remove the design-gate artifact'
    );

    const resumedGate = await workspace.call('get_design_gate_status', { session_id: 'ddl-cleanup' });
    assert.equal(resumedGate.ok, true);
    assert.equal(resumedGate.result.entered_at, null, 'reused session id starts with a fresh gate');
    assert.equal(resumedGate.result.approved_at, null);
  });

  it('persists explicit implementation_plan params that already live in plans/ without copying', async () => {
    const workspace = await SessionWorkspace.create();
    const plansDir = path.join(workspace.dir, 'docs', 'maestro', 'plans');
    const planPath = path.join(plansDir, 'inplace-plan.md');
    writeFile(planPath, '# Inplace Plan\n');

    const create = await createSimpleSession(workspace, 'ddl-inplace', 'foo.txt', { implementation_plan: planPath });
    assert.equal(create.ok, true);

    const state = readSessionState(workspace.dir);
    assert.equal(state.implementation_plan, planPath);
  });

  it('content variant: record_design_approval + create_session materialize both docs without path resolution (Plan Mode host tmp-dir flow)', async () => {
    const workspace = await SessionWorkspace.create();
    const designBody = '# Design (inline)\n\nPassed as content.\n';
    const planBody = '# Plan (inline)\n\nPassed as content.\n';

    const approval = await workspace.approve('ddl-content', {
      design_document_content: designBody,
      design_document_filename: 'design-content.md',
    });
    assert.equal(approval.ok, true);
    const canonicalDesign = path.join(
      workspace.dir,
      'docs',
      'maestro',
      'plans',
      'design-content.md'
    );
    assert.equal(approval.result.design_document_path, canonicalDesign);
    assert.equal(fs.readFileSync(canonicalDesign, 'utf8'), designBody);

    const create = await createSimpleSession(workspace, 'ddl-content', 'x.txt', {
      implementation_plan_content: planBody,
      implementation_plan_filename: 'plan-content.md',
    });
    assert.equal(create.ok, true);

    const canonicalPlan = path.join(
      workspace.dir,
      'docs',
      'maestro',
      'plans',
      'plan-content.md'
    );
    assert.equal(fs.readFileSync(canonicalPlan, 'utf8'), planBody);

    const state = readSessionState(workspace.dir);
    assert.equal(state.design_document, canonicalDesign);
    assert.equal(state.implementation_plan, canonicalPlan);

    const archive = await completeAndArchive(workspace, 'ddl-content', 'x.txt');
    assert.equal(archive.ok, true);
    const archiveRoot = path.join(workspace.dir, 'docs', 'maestro');
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
    const workspace = await SessionWorkspace.create();
    const plansDir = path.join(workspace.dir, 'docs', 'maestro', 'plans');
    const planPath = path.join(plansDir, 'plan.md');
    writeFile(planPath, '# Plan\n');

    const create = await createSimpleSession(workspace, 'ddl-planmutex', 'x.txt', {
      implementation_plan: planPath,
      implementation_plan_content: '# Plan\n',
      implementation_plan_filename: 'plan.md',
    });
    assert.equal(create.ok, false);
    assert.match(create.error || '', /mutually exclusive/i);
  });

  it('create_session accepts no implementation plan (at-most-one-of semantics permits neither)', async () => {
    const workspace = await SessionWorkspace.create();

    const create = await createSimpleSession(workspace, 'ddl-noplan', 'x.txt');
    assert.equal(create.ok, true);

    const state = readSessionState(workspace.dir);
    assert.equal(state.implementation_plan, null);
  });
});
