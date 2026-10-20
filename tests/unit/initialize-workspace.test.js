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

/** A handler context whose workspace records the path initialize_workspace sets. */
function createContext() {
  const context = { recorded: [] };
  context.workspace = { setExplicitWorkspacePath: (value) => context.recorded.push(value) };
  return context;
}

describe('handleInitializeWorkspace', () => {
  it('accepts explicit workspace_path, records it as the project root and returns it', async () => {
    const workspace = makeTempDir('maestro-init-');
    const context = createContext();
    const result = await handleInitializeWorkspace({ workspace_path: workspace }, null, context);
    assert.equal(result.success, true);
    assert.equal(result.workspace_path, workspace);
    assert.equal(result.state_dir, 'docs/maestro');
    assert.deepEqual(context.recorded, [workspace]);
  });

  it('creates only the state and plans trees under <workspace>/docs/maestro', async () => {
    const workspace = makeTempDir('maestro-init-');
    const result = await handleInitializeWorkspace({ workspace_path: workspace }, null, createContext());
    for (const dir of result.created_directories) {
      assert.ok(fs.statSync(path.join(workspace, dir)).isDirectory(), dir);
    }
    assert.deepEqual(fs.readdirSync(path.join(workspace, 'docs', 'maestro')).sort(), ['plans', 'state']);
  });

  it('rejects paths inside an extension cache', async () => {
    const cacheParent = makeTempDir('maestro-cache-parent-');
    const cache = path.join(cacheParent, '.codex', 'plugins', 'maestro');
    fs.mkdirSync(cache, { recursive: true });
    const context = createContext();
    await assert.rejects(
      () => handleInitializeWorkspace({ workspace_path: cache }, null, context),
      (err) => err instanceof WorkspaceResolutionError
    );
    assert.deepEqual(context.recorded, [], 'a rejected path is not recorded');
  });

  it('rejects missing workspace_path', async () => {
    await assert.rejects(
      () => handleInitializeWorkspace({}, null, createContext()),
      (err) => err instanceof WorkspaceResolutionError
    );
  });

  it('accepts cachedProjectRoot as fallback when workspace_path is omitted', async () => {
    const workspace = makeTempDir('maestro-init-');
    const result = await handleInitializeWorkspace({}, workspace, createContext());
    assert.equal(result.success, true);
    assert.equal(result.workspace_path, workspace);
  });
});
