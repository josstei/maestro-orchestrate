const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveProjectRoot } = require('../../src/core/project-root-resolver');
const { withEnv } = require('../support/env');

describe('project root resolver', () => {
  it('prefers an explicit workspace path over inherited cwd-like env vars', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-workspace-'));
    const inheritedPwd = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-pwd-'));

    const result = withEnv(
      {
        MAESTRO_WORKSPACE_PATH: workspaceRoot,
        CLAUDE_PROJECT_DIR: null,
        PWD: inheritedPwd,
        INIT_CWD: null,
      },
      () => resolveProjectRoot()
    );

    assert.equal(result, workspaceRoot);
  });

  it('falls back to inherited PWD when MCP roots are unavailable', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-pwd-root-'));

    const result = withEnv(
      {
        MAESTRO_WORKSPACE_PATH: null,
        CLAUDE_PROJECT_DIR: null,
        PWD: workspaceRoot,
        INIT_CWD: null,
      },
      () => resolveProjectRoot()
    );

    assert.equal(result, workspaceRoot);
  });

  const {
    requireExplicitWorkspaceRoot,
    WorkspaceResolutionError,
  } = require('../../src/core/project-root-resolver');

  it('requireExplicitWorkspaceRoot returns the explicit path when it exists', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-explicit-'));
    const result = requireExplicitWorkspaceRoot({ workspacePath: workspaceRoot });
    assert.equal(result, workspaceRoot);
  });

  it('requireExplicitWorkspaceRoot throws WorkspaceResolutionError when no explicit path is given', () => {
    assert.throws(
      () => requireExplicitWorkspaceRoot({}),
      (err) => err instanceof WorkspaceResolutionError
    );
  });

  it('requireExplicitWorkspaceRoot throws when the explicit path does not exist', () => {
    assert.throws(
      () => requireExplicitWorkspaceRoot({ workspacePath: '/nonexistent/path/abc123' }),
      (err) => err instanceof WorkspaceResolutionError
    );
  });

  it('requireExplicitWorkspaceRoot throws when the path is inside an extension cache', () => {
    const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), '.codex-plugins-cache-'));
    const nested = path.join(
      path.dirname(cachePath),
      '.codex',
      'plugins',
      'maestro'
    );
    fs.mkdirSync(nested, { recursive: true });
    assert.throws(
      () => requireExplicitWorkspaceRoot({ workspacePath: nested }),
      (err) => err instanceof WorkspaceResolutionError && /extension cache/i.test(err.message)
    );
  });
});
