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

async function prepareSession(phaseId = 1) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-hv-'));
  const server = createServerForWorkspace();
  await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
  await server.callTool(
    'create_session',
    {
      session_id: 'hv-1',
      task: 'handoff',
      task_complexity: 'simple',
      phases: [
        {
          id: phaseId,
          name: 'P1',
          agent: 'coder',
          parallel: false,
          blocked_by: [],
          files: ['x'],
        },
      ],
    },
    workspace
  );
  return { server, workspace };
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

    const stateRaw = fs.readFileSync(
      path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md'),
      'utf8'
    );
    const state = JSON.parse(stateRaw.split('---')[1].trim());
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
