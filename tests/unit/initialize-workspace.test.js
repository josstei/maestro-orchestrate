import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleInitializeWorkspace } from '../../dist/src/mcp/handlers/initialize-workspace.js';
import { MARKER_FILENAME } from '../../dist/src/mcp/contracts/workspace-marker.js';
import { WorkspaceResolutionError } from '../../dist/src/core/project-root-resolver.js';

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-init-'));
}

describe('handleInitializeWorkspace', () => {
  it('accepts explicit workspace_path and returns the resolved root', async () => {
    const workspace = makeWorkspace();
    const result = await handleInitializeWorkspace({ workspace_path: workspace });
    assert.equal(result.success, true);
    assert.equal(result.workspace_path, workspace);
    assert.equal(result.state_dir, 'docs/maestro');
  });

  it('writes a workspace marker to <workspace>/docs/maestro', async () => {
    const workspace = makeWorkspace();
    await handleInitializeWorkspace({ workspace_path: workspace });
    const markerPath = path.join(workspace, 'docs', 'maestro', MARKER_FILENAME);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    assert.equal(marker.workspace_path, workspace);
    assert.equal(marker.schema_version, 1);
    const markerExists = fs.existsSync(
      path.join(workspace, 'docs', 'maestro', MARKER_FILENAME)
    );
    assert.equal(markerExists, true);
  });

  it('rejects paths inside an extension cache', async () => {
    const cacheParent = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cache-parent-'));
    const cache = path.join(cacheParent, '.codex', 'plugins', 'maestro');
    fs.mkdirSync(cache, { recursive: true });
    await assert.rejects(
      () => handleInitializeWorkspace({ workspace_path: cache }),
      (err) => err instanceof WorkspaceResolutionError
    );
  });

  it('rejects missing workspace_path', async () => {
    await assert.rejects(
      () => handleInitializeWorkspace({}),
      (err) => err instanceof WorkspaceResolutionError
    );
  });

  it('rejects dispatcher-root fallback when workspace_path is omitted', async () => {
    const workspace = makeWorkspace();
    await assert.rejects(
      () => handleInitializeWorkspace({}, workspace),
      (err) => err instanceof WorkspaceResolutionError
    );
  });
});
