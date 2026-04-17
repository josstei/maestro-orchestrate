'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  handleInitializeWorkspace,
} = require('../../src/mcp/handlers/initialize-workspace');
const {
  MARKER_FILENAME,
  readWorkspaceMarker,
} = require('../../src/mcp/contracts/workspace-marker');
const {
  WorkspaceResolutionError,
} = require('../../src/core/project-root-resolver');

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
    const marker = readWorkspaceMarker(path.join(workspace, 'docs', 'maestro'));
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

  it('accepts cachedProjectRoot as fallback when workspace_path is omitted', async () => {
    const workspace = makeWorkspace();
    const result = await handleInitializeWorkspace({}, workspace);
    assert.equal(result.success, true);
    assert.equal(result.workspace_path, workspace);
  });
});
