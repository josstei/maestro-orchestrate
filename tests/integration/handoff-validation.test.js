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

describe('handoff validation', () => {
  it('transition_phase rejects files + empty downstream_context', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-hv-'));
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createWorkspacePack, createSessionPack],
    });
    await server.callTool(
      'initialize_workspace',
      { workspace_path: workspace },
      workspace
    );

    await server.callTool(
      'create_session',
      {
        session_id: 'hv-1',
        task: 'handoff',
        task_complexity: 'simple',
        phases: [
          {
            id: 1,
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
    assert.match(empty.error || '', /HANDOFF_INCOMPLETE|downstream context/i);

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
});
