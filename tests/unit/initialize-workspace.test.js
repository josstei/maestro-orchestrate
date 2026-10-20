'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  handleInitializeWorkspace,
} = require('../../src/mcp/handlers/initialize-workspace');
const {
  WorkspaceResolutionError,
} = require('../../src/core/project-root-resolver');
const { makeTempDir } = require('../support/fs');

describe('handleInitializeWorkspace', () => {
  it('accepts explicit workspace_path and returns the resolved root', async () => {
    const workspace = makeTempDir('maestro-init-');
    const result = await handleInitializeWorkspace({ workspace_path: workspace });
    assert.equal(result.success, true);
    assert.equal(result.workspace_path, workspace);
    assert.equal(result.state_dir, 'docs/maestro');
  });

  it('creates only the state and plans trees under <workspace>/docs/maestro', async () => {
    const workspace = makeTempDir('maestro-init-');
    const result = await handleInitializeWorkspace({ workspace_path: workspace });
    for (const dir of result.created_directories) {
      assert.ok(fs.statSync(path.join(workspace, dir)).isDirectory(), dir);
    }
    assert.deepEqual(fs.readdirSync(path.join(workspace, 'docs', 'maestro')).sort(), ['plans', 'state']);
  });

  it('rejects paths inside an extension cache', async () => {
    const cacheParent = makeTempDir('maestro-cache-parent-');
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
    const workspace = makeTempDir('maestro-init-');
    const result = await handleInitializeWorkspace({}, workspace);
    assert.equal(result.success, true);
    assert.equal(result.workspace_path, workspace);
  });
});
