import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildMcpServer } from '../support/mcp.js';
import { makeTempDir } from '../support/filesystem.js';

describe('codex workspace resolution contract', () => {
  it('rejects initialize_workspace with a path inside a plugin cache', async (t) => {
    const cacheParent = makeTempDir(t, 'codex-cache-parent-');
    const cache = path.join(cacheParent, '.codex', 'plugins', 'maestro');
    fs.mkdirSync(cache, { recursive: true });

    const server = await buildMcpServer({ runtime: 'codex', testContext: t });

    const outcome = await server.callTool(
      'initialize_workspace',
      { workspace_path: cache },
      cache
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /extension cache/i);
  });

  it('rejects initialize_workspace with a missing workspace_path', async (t) => {
    const server = await buildMcpServer({ runtime: 'codex', testContext: t });

    const outcome = await server.callTool(
      'initialize_workspace',
      {},
      null
    );
    assert.equal(outcome.ok, false);
    assert.match(outcome.error || '', /workspace|required|initialize/i);
  });

  it('accepts initialize_workspace with a plain workspace and writes a marker', async (t) => {
    const workspace = makeTempDir(t, 'codex-ws-');

    const server = await buildMcpServer({ runtime: 'codex', testContext: t });

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
