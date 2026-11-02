'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isExtensionCachePath,
  resolveProjectRoot,
  requireExplicitWorkspaceRoot,
  WorkspaceResolutionError,
} = require('../../src/core/project-root-resolver');
const { withEnv } = require('../support/env');
const { makeTempDir } = require('../support/fs');

describe('project root resolver', () => {
  it('prefers an explicit workspace path over inherited cwd-like env vars', () => {
    const workspaceRoot = makeTempDir('maestro-workspace-');
    const inheritedPwd = makeTempDir('maestro-pwd-');

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
    const workspaceRoot = makeTempDir('maestro-pwd-root-');

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

  it('requireExplicitWorkspaceRoot returns the explicit path when it exists', () => {
    const workspaceRoot = makeTempDir('maestro-explicit-');
    const result = requireExplicitWorkspaceRoot(workspaceRoot);
    assert.equal(result, workspaceRoot);
  });

  it('requireExplicitWorkspaceRoot throws WorkspaceResolutionError when no explicit path is given', () => {
    assert.throws(
      () => requireExplicitWorkspaceRoot(),
      (err) => err instanceof WorkspaceResolutionError
    );
  });

  it('requireExplicitWorkspaceRoot throws when the explicit path does not exist', () => {
    assert.throws(
      () => requireExplicitWorkspaceRoot('/nonexistent/path/abc123'),
      (err) => err instanceof WorkspaceResolutionError
    );
  });

  it('requireExplicitWorkspaceRoot throws when the path is inside an extension cache', () => {
    const cacheParent = makeTempDir('maestro-cache-parent-');
    const nested = path.join(cacheParent, '.codex', 'plugins', 'maestro');
    fs.mkdirSync(nested, { recursive: true });
    assert.throws(
      () => requireExplicitWorkspaceRoot(nested),
      (err) => err instanceof WorkspaceResolutionError && /extension cache/i.test(err.message)
    );
  });

  it('isExtensionCachePath matches host cache directories and paths below them', () => {
    for (const candidate of [
      '/Users/me/.codex/plugins/cache/foo/bar',
      '/Users/me/.claude/plugins/cache/foo',
      '/Users/me/.gemini/config/plugins/maestro',
      '/Users/me/.gemini/antigravity-cli/plugins/maestro/mcp',
      '/Users/me/.codex/plugins',
      '/Users/me/.claude/plugins',
      '/Users/me/.gemini/config/plugins',
      '/Users/me/.gemini/antigravity-cli/plugins',
    ]) {
      assert.equal(isExtensionCachePath(candidate), true, candidate);
    }
  });

  it('isExtensionCachePath requires whole contiguous segments and ignores Gemini CLI extensions', () => {
    for (const candidate of [
      '/a/config/plugins',
      '/Users/me/.gemini/config',
      '/Users/me/.gemini/plugins',
      '/Users/me/.gemini/antigravity-cli',
      '/Users/me/.gemini/x/config/plugins',
      '/Users/me/config/plugins/.gemini',
      '/Users/me/.gemini/config/plugins-research',
      '/Users/me/dev/.gemini-config/plugins',
      '/Users/me/.gemini/extensions/foo',
      '/Users/me/dev/my-project/.codex-plugins-research',
      '/Users/me/Development/maestro-orchestrate',
    ]) {
      assert.equal(isExtensionCachePath(candidate), false, candidate);
    }
  });
});
