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

describe('codex workspace resolution contract', () => {
  it('rejects initialize_workspace with a path inside a plugin cache', async () => {
    const cacheParent = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cache-parent-'));
    const cache = path.join(cacheParent, '.codex', 'plugins', 'maestro');
    fs.mkdirSync(cache, { recursive: true });

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createWorkspacePack, createSessionPack],
    });

    const outcome = await server.callTool(
      'initialize_workspace',
      { workspace_path: cache },
      cache
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /extension cache/i);
  });

  it('rejects initialize_workspace with a missing workspace_path', async () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createWorkspacePack, createSessionPack],
    });

    const outcome = await server.callTool(
      'initialize_workspace',
      {},
      null
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /workspace|required|initialize/i);
  });

  it('accepts initialize_workspace with a plain workspace and writes a marker', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-ws-'));

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createWorkspacePack, createSessionPack],
    });

    const outcome = await server.callTool(
      'initialize_workspace',
      { workspace_path: workspace },
      workspace
    );
    assert.equal(outcome.ok, true);
    const markerPath = path.join(workspace, 'docs', 'maestro', '.workspace-root');
    assert.equal(fs.existsSync(markerPath), true);
  });
});
