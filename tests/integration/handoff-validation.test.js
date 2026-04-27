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
    runtimeConfig: { name: 'codex' },
    services: {},
    toolPacks: [createWorkspacePack, createSessionPack],
  });
}

async function prepareSession(opts = {}) {
  const phaseId = typeof opts === 'number' ? opts : opts.phaseId ?? 1;
  const kind = typeof opts === 'object' ? opts.kind : undefined;
  const multiPhase = typeof opts === 'object' ? Boolean(opts.multiPhase) : false;
  const parentPhaseId = typeof opts === 'object' ? opts.parentPhaseId : undefined;
  const phaseAgents =
    typeof opts === 'object' && Array.isArray(opts.phaseAgents)
      ? opts.phaseAgents
      : null;

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-hv-'));
  const server = createServerForWorkspace();
  await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);

  const phaseSpec = {
    id: phaseId,
    name: 'P1',
    agent: 'coder',
    parallel: false,
    blocked_by: [],
    files: ['x'],
  };
  if (kind !== undefined) phaseSpec.kind = kind;
  if (parentPhaseId !== undefined) phaseSpec.parent_phase_id = parentPhaseId;

  const phases = [phaseSpec];
  if (multiPhase) {
    phases.push({
      id: phaseId + 1,
      name: 'P2-terminal',
      agent: 'coder',
      parallel: false,
      blocked_by: [phaseId],
      files: [],
    });
  }

  await server.callTool(
    'create_session',
    {
      session_id: 'hv-1',
      task: 'handoff',
      task_complexity: 'simple',
      phases,
    },
    workspace
  );

  if (phaseAgents) {
    const statePath = path.join(
      workspace,
      'docs',
      'maestro',
      'state',
      'active-session.md'
    );
    const raw = fs.readFileSync(statePath, 'utf8');
    const parts = raw.split('---');
    const state = JSON.parse(parts[1].trim());
    const target = state.phases.find((phase) => phase.id === phaseId);
    target.agents = phaseAgents;
    const rewritten = `---\n${JSON.stringify(state, null, 2)}\n---${parts.slice(2).join('---')}`;
    fs.writeFileSync(statePath, rewritten);
  }

  return { server, workspace };
}

function readActiveSessionState(workspace) {
  const stateRaw = fs.readFileSync(
    path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md'),
    'utf8'
  );
  return JSON.parse(stateRaw.split('---')[1].trim());
}

describe('handoff validation', () => {
  it('rejects files with empty downstream_context and accepts array payload on retry', async () => {
    const { server, workspace } = await prepareSession();

    const empty = await server.callTool(
      'transition_phase',
      {
        session_id: 'hv-1',
        completed_phase_id: 1,
        files_created: ['src/foo.js'],
        downstream_context: {},
      },
      workspace
    );
    assert.equal(empty.ok, false);
    assert.equal(empty.code, 'HANDOFF_INCOMPLETE');
    assert.match(empty.error || '', /downstream_context is empty after normalization/i);

    const populated = await server.callTool(
      'transition_phase',
      {
        session_id: 'hv-1',
        completed_phase_id: 1,
        files_created: ['src/foo.js'],
        downstream_context: { integration_points: ['src/foo.js'] },
      },
      workspace
    );
    assert.equal(populated.ok, true);
  });

  it('accepts string-valued downstream_context per the agent-base-protocol template', async () => {
    const { server, workspace } = await prepareSession();

    const stringForm = await server.callTool(
      'transition_phase',
      {
        session_id: 'hv-1',
        completed_phase_id: 1,
        files_created: ['index.html', 'styles.css'],
        downstream_context: {
          integration_points:
            'styles.css contains the root variables and base layout that subsequent phases should extend.',
          patterns_established: 'Full-viewport flexbox centering with CSS root variables.',
          assumptions: 'The central container is the primary target for all animations.',
          key_interfaces_introduced: 'none',
          warnings: 'none',
        },
      },
      workspace
    );

    assert.equal(
      stringForm.ok,
      true,
      `string-valued downstream_context should be accepted: ${stringForm.error || ''}`
    );

    const state = readActiveSessionState(workspace);
    const phase = state.phases.find((candidate) => candidate.id === 1);

    assert.deepEqual(phase.downstream_context.integration_points, [
      'styles.css contains the root variables and base layout that subsequent phases should extend.',
    ]);
    assert.deepEqual(phase.downstream_context.patterns_established, [
      'Full-viewport flexbox centering with CSS root variables.',
    ]);
    assert.deepEqual(phase.downstream_context.key_interfaces_introduced, []);
    assert.deepEqual(phase.downstream_context.warnings, []);
  });

  it('rejects downstream_context whose fields are all "none" even though the object is non-empty', async () => {
    const { server, workspace } = await prepareSession();

    const allNone = await server.callTool(
      'transition_phase',
      {
        session_id: 'hv-1',
        completed_phase_id: 1,
        files_created: ['src/foo.js'],
        downstream_context: {
          integration_points: 'none',
          patterns_established: 'N/A',
          assumptions: '',
          key_interfaces_introduced: 'none',
          warnings: 'none',
        },
      },
      workspace
    );

    assert.equal(allNone.ok, false);
    assert.equal(allNone.code, 'HANDOFF_INCOMPLETE');
    assert.ok(
      allNone.details && allNone.details.received_downstream_context,
      'error details should echo the received payload for debugging'
    );
  });

  it('drops unknown (non-canonical) keys and normalizes case-mismatched inputs to empty', async () => {
    const { server, workspace } = await prepareSession();

    const pascal = await server.callTool(
      'transition_phase',
      {
        session_id: 'hv-1',
        completed_phase_id: 1,
        files_created: ['src/foo.js'],
        downstream_context: {
          IntegrationPoints: 'PascalCase is not canonical',
          summary: 'neither is summary',
        },
      },
      workspace
    );

    assert.equal(pascal.ok, false);
    assert.equal(pascal.code, 'HANDOFF_INCOMPLETE');
  });
});

describe('kind-aware handoff', () => {
  describe('legacy session (no explicit kind)', () => {
    it('non-terminal phase: files + populated context succeeds and does not require reconciliation', async () => {
      const { server, workspace } = await prepareSession({ multiPhase: true });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          files_created: ['src/foo.js'],
          downstream_context: { integration_points: ['src/foo.js'] },
        },
        workspace
      );

      assert.equal(result.ok, true, `expected success: ${result.error || ''}`);

      const state = readActiveSessionState(workspace);
      const phase = state.phases.find((candidate) => candidate.id === 1);
      assert.equal(phase.requires_reconciliation, false);
      assert.equal(phase.kind, 'implementation');
    });

    it('non-terminal phase: files + empty context still fails with HANDOFF_INCOMPLETE (always-on rule)', async () => {
      const { server, workspace } = await prepareSession({ multiPhase: true });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          files_created: ['src/foo.js'],
          downstream_context: {},
        },
        workspace
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 'HANDOFF_INCOMPLETE');
    });

    it('non-terminal phase: no files + empty context flags requires_reconciliation: true', async () => {
      const { server, workspace } = await prepareSession({ multiPhase: true });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          files_created: [],
          files_modified: [],
          files_deleted: [],
          downstream_context: {},
        },
        workspace
      );

      assert.equal(result.ok, true);

      const state = readActiveSessionState(workspace);
      const phase = state.phases.find((candidate) => candidate.id === 1);
      assert.equal(phase.requires_reconciliation, true);
      assert.equal(phase.kind, 'implementation');
    });

    it('non-terminal phase: no files + populated context does not require reconciliation', async () => {
      const { server, workspace } = await prepareSession({ multiPhase: true });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          downstream_context: { integration_points: ['src/foo.js'] },
        },
        workspace
      );

      assert.equal(result.ok, true);

      const state = readActiveSessionState(workspace);
      const phase = state.phases.find((candidate) => candidate.id === 1);
      assert.equal(phase.requires_reconciliation, false);
    });
  });

  describe('explicit kind: implementation', () => {
    it('files + populated context succeeds', async () => {
      const { server, workspace } = await prepareSession({
        kind: 'implementation',
        multiPhase: true,
      });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          files_created: ['src/foo.js'],
          downstream_context: { integration_points: ['src/foo.js'] },
        },
        workspace
      );

      assert.equal(result.ok, true, `expected success: ${result.error || ''}`);
    });

    it('files + empty context fails with HANDOFF_INCOMPLETE', async () => {
      const { server, workspace } = await prepareSession({
        kind: 'implementation',
        multiPhase: true,
      });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          files_created: ['src/foo.js'],
          downstream_context: {},
        },
        workspace
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 'HANDOFF_INCOMPLETE');
    });

    it('no files + empty context flags requires_reconciliation: true', async () => {
      const { server, workspace } = await prepareSession({
        kind: 'implementation',
        multiPhase: true,
      });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          downstream_context: {},
        },
        workspace
      );

      assert.equal(result.ok, true);

      const state = readActiveSessionState(workspace);
      const phase = state.phases.find((candidate) => candidate.id === 1);
      assert.equal(phase.requires_reconciliation, true);
    });
  });

  describe('explicit kind: review', () => {
    it('missing findings field fails with HANDOFF_FIELD_MISSING', async () => {
      const { server, workspace } = await prepareSession({ kind: 'review' });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
        },
        workspace
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 'HANDOFF_FIELD_MISSING');
      assert.match(result.error || '', /review handoff requires non-empty 'findings'/);
    });

    it('empty findings array fails with HANDOFF_FIELD_MISSING', async () => {
      const { server, workspace } = await prepareSession({ kind: 'review' });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          findings: [],
        },
        workspace
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 'HANDOFF_FIELD_MISSING');
    });

    it('non-empty findings succeeds and never requires reconciliation', async () => {
      const { server, workspace } = await prepareSession({ kind: 'review' });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          findings: [{ id: 'F1', severity: 'major' }],
        },
        workspace
      );

      assert.equal(result.ok, true, `expected success: ${result.error || ''}`);

      const state = readActiveSessionState(workspace);
      const phase = state.phases.find((candidate) => candidate.id === 1);
      assert.equal(phase.kind, 'review');
      assert.equal(phase.requires_reconciliation, false);
      assert.deepEqual(phase.findings, [{ id: 'F1', severity: 'major' }]);
    });
  });

  describe('explicit kind: verification', () => {
    it('missing final_artifacts fails with HANDOFF_FIELD_MISSING', async () => {
      const { server, workspace } = await prepareSession({ kind: 'verification' });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
        },
        workspace
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 'HANDOFF_FIELD_MISSING');
      assert.match(result.error || '', /verification handoff requires non-empty 'final_artifacts'/);
    });

    it('non-empty final_artifacts succeeds and never requires reconciliation', async () => {
      const { server, workspace } = await prepareSession({ kind: 'verification' });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          final_artifacts: { '/foo': 'sha:abc' },
        },
        workspace
      );

      assert.equal(result.ok, true, `expected success: ${result.error || ''}`);

      const state = readActiveSessionState(workspace);
      const phase = state.phases.find((candidate) => candidate.id === 1);
      assert.equal(phase.kind, 'verification');
      assert.equal(phase.requires_reconciliation, false);
      assert.deepEqual(phase.final_artifacts, { '/foo': 'sha:abc' });
    });
  });

  describe('explicit kind: revision', () => {
    it('missing addressed_finding_ids fails with HANDOFF_FIELD_MISSING', async () => {
      const { server, workspace } = await prepareSession({
        kind: 'revision',
        parentPhaseId: 1,
      });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
        },
        workspace
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 'HANDOFF_FIELD_MISSING');
      assert.match(result.error || '', /revision handoff requires non-empty 'addressed_finding_ids'/);
    });

    it('non-empty addressed_finding_ids succeeds and never requires reconciliation', async () => {
      const { server, workspace } = await prepareSession({
        kind: 'revision',
        parentPhaseId: 1,
      });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          addressed_finding_ids: ['F1'],
        },
        workspace
      );

      assert.equal(result.ok, true, `expected success: ${result.error || ''}`);

      const state = readActiveSessionState(workspace);
      const phase = state.phases.find((candidate) => candidate.id === 1);
      assert.equal(phase.kind, 'revision');
      assert.equal(phase.requires_reconciliation, false);
      assert.deepEqual(phase.addressed_finding_ids, ['F1']);
    });
  });

  describe('strict-mode toggle by kindIsExplicit', () => {
    it('new single-phase session defaults to implementation instead of terminal verification', async () => {
      const { server, workspace } = await prepareSession();

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
        },
        workspace
      );

      assert.equal(
        result.ok,
        true,
        `new terminal implementation phase should not be inferred as verification: ${result.error || ''}`
      );

      const state = readActiveSessionState(workspace);
      const phase = state.phases.find((candidate) => candidate.id === 1);
      assert.equal(phase.kind, 'implementation');
      assert.equal(phase.requires_reconciliation, true);
    });

    it('legacy hand-edited single-phase session without kind still infers terminal verification in loose mode', async () => {
      const { server, workspace } = await prepareSession();
      const statePath = path.join(
        workspace,
        'docs',
        'maestro',
        'state',
        'active-session.md'
      );
      const raw = fs.readFileSync(statePath, 'utf8');
      const parts = raw.split('---');
      const state = JSON.parse(parts[1].trim());
      delete state.phases[0].kind;
      const rewritten = `---\n${JSON.stringify(state, null, 2)}\n---${parts.slice(2).join('---')}`;
      fs.writeFileSync(statePath, rewritten);

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
        },
        workspace
      );

      assert.equal(
        result.ok,
        true,
        `legacy terminal phase should not be forced to provide final_artifacts: ${result.error || ''}`
      );

      const updatedState = readActiveSessionState(workspace);
      const phase = updatedState.phases.find((candidate) => candidate.id === 1);
      assert.equal(phase.kind, 'verification');
      assert.equal(phase.requires_reconciliation, false);
    });

    it('explicit kind=verification with no final_artifacts fails (strict: true)', async () => {
      const { server, workspace } = await prepareSession({ kind: 'verification' });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
        },
        workspace
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 'HANDOFF_FIELD_MISSING');
    });
  });

  describe('error envelope details', () => {
    it('includes phase_id, phase_kind, and kind_is_explicit on violation', async () => {
      const { server, workspace } = await prepareSession({ kind: 'review' });

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
        },
        workspace
      );

      assert.equal(result.ok, false);
      assert.ok(result.details, 'failure should include details payload');
      assert.equal(result.details.phase_id, 1);
      assert.equal(result.details.phase_kind, 'review');
      assert.equal(result.details.kind_is_explicit, true);
    });
  });

  describe('unrecognized phase kind defense', () => {
    it('rejects transition for a phase with hand-edited unknown kind value', async () => {
      const { server, workspace } = await prepareSession();

      const statePath = path.join(
        workspace,
        'docs',
        'maestro',
        'state',
        'active-session.md'
      );
      const raw = fs.readFileSync(statePath, 'utf8');
      const parts = raw.split('---');
      const state = JSON.parse(parts[1].trim());
      state.phases[0].kind = 'bugfix';
      const rewritten = `---\n${JSON.stringify(state, null, 2)}\n---${parts.slice(2).join('---')}`;
      fs.writeFileSync(statePath, rewritten);

      const result = await server.callTool(
        'transition_phase',
        {
          session_id: 'hv-1',
          completed_phase_id: 1,
          files_created: ['x.js'],
          downstream_context: { integration_points: ['x.js'] },
        },
        workspace
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 'PHASE_KIND_INVALID');
      assert.ok(result.details);
      assert.equal(result.details.phase_kind, 'bugfix');
      assert.deepEqual(result.details.allowed_kinds, [
        'implementation',
        'review',
        'revision',
        'verification',
      ]);
    });
  });
});
