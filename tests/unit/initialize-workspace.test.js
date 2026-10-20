'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { handleInitializeWorkspace } = require('../../src/mcp/handlers/initialize-workspace');
const { makeTempDir } = require('../support/fs');

/** A handler context whose workspace records the path initialize_workspace sets. */
function createContext() {
  const context = { recorded: [] };
  context.workspace = { setExplicitWorkspacePath: (value) => context.recorded.push(value) };
  return context;
}

/** Asserts that the call fails with a WorkspaceResolutionError `code` and records nothing. */
function assertRejected(params, projectRoot, code) {
  const context = createContext();
  assert.throws(
    () => handleInitializeWorkspace(params, projectRoot, context),
    { name: 'WorkspaceResolutionError', code }
  );
  assert.deepEqual(context.recorded, [], 'a rejected path is not recorded');
}

describe('handleInitializeWorkspace', () => {
  it('accepts explicit workspace_path, records it as the project root and returns it', () => {
    const workspace = makeTempDir('maestro-init-');
    const context = createContext();
    const result = handleInitializeWorkspace({ workspace_path: workspace }, null, context);
    assert.equal(result.success, true);
    assert.equal(result.workspace_path, workspace);
    assert.equal(result.state_dir, 'docs/maestro');
    assert.deepEqual(context.recorded, [workspace]);
  });

  it('creates only the state and plans trees under <workspace>/docs/maestro', () => {
    const workspace = makeTempDir('maestro-init-');
    const result = handleInitializeWorkspace({ workspace_path: workspace }, null, createContext());
    for (const dir of result.created_directories) {
      assert.ok(fs.statSync(path.join(workspace, dir)).isDirectory(), dir);
    }
    assert.deepEqual(fs.readdirSync(path.join(workspace, 'docs', 'maestro')).sort(), ['plans', 'state']);
  });

  it('rejects a missing workspace_path while no workspace is initialized', () => {
    assertRejected({}, null, 'WORKSPACE_REQUIRED');
    assertRejected({ workspace_path: '' }, null, 'WORKSPACE_REQUIRED');
    assertRejected({ workspace_path: '${workspacePath}' }, null, 'WORKSPACE_REQUIRED');
  });

  it('rejects a workspace_path that does not exist', () => {
    assertRejected({ workspace_path: path.join(makeTempDir('maestro-init-'), 'missing') }, null, 'WORKSPACE_NOT_FOUND');
  });

  it('rejects paths inside an extension cache', () => {
    const cache = path.join(makeTempDir('maestro-cache-parent-'), '.codex', 'plugins', 'maestro');
    fs.mkdirSync(cache, { recursive: true });
    assertRejected({ workspace_path: cache }, null, 'WORKSPACE_IN_EXTENSION_CACHE');
  });

  it('re-initializes the current project root when workspace_path is omitted', () => {
    const workspace = makeTempDir('maestro-init-');
    const result = handleInitializeWorkspace({}, workspace, createContext());
    assert.equal(result.success, true);
    assert.equal(result.workspace_path, workspace);
  });
});
