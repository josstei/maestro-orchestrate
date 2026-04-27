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

/**
 * Build a fake ephemeral home + ephemeral plan path under that home, override
 * `os.homedir()` for the duration of the test, and clear the require cache
 * for the translator so it picks up the override. The translator reads
 * `os.homedir()` at call time, so we only need to override `homedir` —
 * EPHEMERAL_ROOTS is loaded once from runtime-configs and is independent of
 * the current home.
 */
function withFakeHome(testFn) {
  return async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-fake-home-'));
    const realHomedir = os.homedir;
    os.homedir = () => fakeHome;
    try {
      await testFn(fakeHome);
    } finally {
      os.homedir = realHomedir;
    }
  };
}

describe('ephemeral plan-path translation: Gemini/Qwen tmp paths materialize before runtime cleanup', () => {
  it(
    'record_design_approval materializes a Gemini ephemeral path immediately into <state_dir>/plans/',
    withFakeHome(async (fakeHome) => {
      const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-eph-design-'));
      const ephemeralDir = path.join(fakeHome, '.gemini', 'tmp', 'session-uuid', 'plans');
      const ephemeralPath = path.join(ephemeralDir, 'design.md');
      writeFile(ephemeralPath, '# Ephemeral Design\n');

      const server = createServerForWorkspace();
      await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
      await server.callTool('enter_design_gate', { session_id: 'eph-1' }, workspace);

      const approval = await server.callTool(
        'record_design_approval',
        { session_id: 'eph-1', design_document_path: ephemeralPath },
        workspace
      );
      assert.equal(approval.ok, true);

      const canonical = path.join(workspace, 'docs', 'maestro', 'plans', 'design.md');
      assert.equal(
        approval.result.design_document_path,
        canonical,
        'gate must record the canonical path, not the ephemeral one'
      );
      assert.equal(
        fs.existsSync(canonical),
        true,
        'ephemeral file must be materialized into plans/ at approval time'
      );
      assert.equal(fs.readFileSync(canonical, 'utf8'), '# Ephemeral Design\n');
    })
  );

  it(
    'F6 regression: canonical copy survives Gemini tmp cleanup between record_design_approval and create_session',
    withFakeHome(async (fakeHome) => {
      const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-eph-cleanup-'));
      const ephemeralDir = path.join(fakeHome, '.gemini', 'tmp', 'gone-uuid', 'plans');
      const ephemeralPath = path.join(ephemeralDir, 'design.md');
      writeFile(ephemeralPath, '# Will Vanish\n');

      const server = createServerForWorkspace();
      await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
      await server.callTool('enter_design_gate', { session_id: 'eph-cleanup' }, workspace);
      await server.callTool(
        'record_design_approval',
        { session_id: 'eph-cleanup', design_document_path: ephemeralPath },
        workspace
      );

      fs.rmSync(path.join(fakeHome, '.gemini'), { recursive: true, force: true });
      assert.equal(
        fs.existsSync(ephemeralPath),
        false,
        'sanity check: ephemeral source must be gone before create_session'
      );

      const create = await server.callTool(
        'create_session',
        {
          session_id: 'eph-cleanup',
          task: 'survives cleanup',
          task_complexity: 'simple',
          phases: [
            { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['index.html'] },
          ],
        },
        workspace
      );
      assert.equal(
        create.ok,
        true,
        'create_session must succeed because record_design_approval already copied the doc'
      );

      const canonical = path.join(workspace, 'docs', 'maestro', 'plans', 'design.md');
      assert.equal(fs.readFileSync(canonical, 'utf8'), '# Will Vanish\n');
    })
  );

  it(
    'record_design_approval materializes a Qwen ephemeral path immediately',
    withFakeHome(async (fakeHome) => {
      const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-eph-qwen-'));
      const ephemeralPath = path.join(
        fakeHome,
        '.qwen',
        'tmp',
        'qwen-session',
        'plans',
        'design.md'
      );
      writeFile(ephemeralPath, '# Qwen Design\n');

      const server = createServerForWorkspace();
      await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
      await server.callTool('enter_design_gate', { session_id: 'eph-qwen' }, workspace);
      const approval = await server.callTool(
        'record_design_approval',
        { session_id: 'eph-qwen', design_document_path: ephemeralPath },
        workspace
      );
      assert.equal(approval.ok, true);
      const canonical = path.join(workspace, 'docs', 'maestro', 'plans', 'design.md');
      assert.equal(approval.result.design_document_path, canonical);
      assert.equal(fs.existsSync(canonical), true);
    })
  );

  it(
    'non-ephemeral paths preserve deferred-copy semantics (no materialization at approval time)',
    withFakeHome(async (fakeHome) => {
      const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-noneph-'));
      const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-external-'));
      const externalPath = path.join(externalDir, 'plans', 'design.md');

      const server = createServerForWorkspace();
      await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
      await server.callTool('enter_design_gate', { session_id: 'noneph' }, workspace);
      const approval = await server.callTool(
        'record_design_approval',
        { session_id: 'noneph', design_document_path: externalPath },
        workspace
      );
      assert.equal(approval.ok, true);
      assert.equal(
        approval.result.design_document_path,
        externalPath,
        'non-ephemeral paths must be recorded as-is (deferred copy)'
      );
      assert.equal(
        fs.existsSync(path.join(workspace, 'docs', 'maestro', 'plans', 'design.md')),
        false,
        'no copy should occur at approval time for non-ephemeral paths'
      );
      assert.equal(
        fakeHome.length > 0,
        true,
        'fake home is provisioned but unused for non-ephemeral path'
      );
    })
  );

  it(
    'record_design_approval rejects an ephemeral path whose source file does not exist',
    withFakeHome(async (fakeHome) => {
      const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-eph-missing-'));
      const phantomPath = path.join(
        fakeHome,
        '.gemini',
        'tmp',
        'phantom',
        'design.md'
      );

      const server = createServerForWorkspace();
      await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
      await server.callTool('enter_design_gate', { session_id: 'eph-missing' }, workspace);
      const approval = await server.callTool(
        'record_design_approval',
        { session_id: 'eph-missing', design_document_path: phantomPath },
        workspace
      );
      assert.equal(approval.ok, false);
      assert.equal(approval.code, 'NOT_FOUND');
      assert.match(approval.error, /design_document does not exist/i);
    })
  );

  it(
    'F6 regression for implementation plans: ephemeral plan path materializes at create_session',
    withFakeHome(async (fakeHome) => {
      const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-eph-plan-'));
      const ephemeralPlan = path.join(
        fakeHome,
        '.gemini',
        'tmp',
        'plan-session',
        'plans',
        'plan.md'
      );
      writeFile(ephemeralPlan, '# Ephemeral Plan\n');

      const designPath = path.join(workspace, 'docs', 'maestro', 'plans', 'design.md');
      writeFile(designPath, '# Design\n');

      const server = createServerForWorkspace();
      await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
      await server.callTool('enter_design_gate', { session_id: 'eph-plan' }, workspace);
      await server.callTool(
        'record_design_approval',
        { session_id: 'eph-plan', design_document_path: designPath },
        workspace
      );

      const create = await server.callTool(
        'create_session',
        {
          session_id: 'eph-plan',
          task: 'eph plan',
          task_complexity: 'simple',
          implementation_plan: ephemeralPlan,
          phases: [
            { id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files: ['x.txt'] },
          ],
        },
        workspace
      );
      assert.equal(create.ok, true);

      const canonical = path.join(workspace, 'docs', 'maestro', 'plans', 'plan.md');
      assert.equal(fs.existsSync(canonical), true);
      assert.equal(fs.readFileSync(canonical, 'utf8'), '# Ephemeral Plan\n');

      fs.rmSync(path.join(fakeHome, '.gemini'), { recursive: true, force: true });
      const stateRaw = fs.readFileSync(
        path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md'),
        'utf8'
      );
      const state = JSON.parse(stateRaw.split('---')[1].trim());
      assert.equal(
        state.implementation_plan,
        canonical,
        'state must point to canonical, not ephemeral path'
      );
      assert.equal(
        fs.existsSync(state.implementation_plan),
        true,
        'canonical plan must survive ephemeral cleanup'
      );
    })
  );

  it(
    'an ephemeral path that mimics .gemini/tmp as an interior segment is NOT treated as ephemeral',
    withFakeHome(async (fakeHome) => {
      const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-eph-interior-'));
      const decoyDir = path.join(workspace, 'project', '.gemini', 'tmp', 'plans');
      const decoyPath = path.join(decoyDir, 'design.md');
      writeFile(decoyPath, '# Decoy\n');

      const server = createServerForWorkspace();
      await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
      await server.callTool('enter_design_gate', { session_id: 'eph-decoy' }, workspace);
      const approval = await server.callTool(
        'record_design_approval',
        { session_id: 'eph-decoy', design_document_path: decoyPath },
        workspace
      );
      assert.equal(approval.ok, true);
      assert.equal(
        approval.result.design_document_path,
        decoyPath,
        'interior .gemini/tmp must NOT match the ephemeral root under fake home'
      );
      assert.equal(
        fs.existsSync(path.join(workspace, 'docs', 'maestro', 'plans', 'design.md')),
        false,
        'no immediate copy for non-ephemeral interior-segment paths'
      );
      assert.equal(fakeHome.length > 0, true);
    })
  );
});
