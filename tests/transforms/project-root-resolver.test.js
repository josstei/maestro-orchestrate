const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  resolveProjectRoot,
  resolveProjectRootForRuntime,
} = require('../../src/core/project-root-resolver');
const { createProjectRootCache } = require('../../src/mcp/core/project-root-cache');
const { makeTempSrcRoot, cleanupTempRoots } = require('../support/content');

after(cleanupTempRoots);

function withEnv(overrides, fn) {
  const previous = {
    MAESTRO_WORKSPACE_PATH: process.env.MAESTRO_WORKSPACE_PATH,
    CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR,
    PWD: process.env.PWD,
    INIT_CWD: process.env.INIT_CWD,
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }
  }
}

describe('project root resolver', () => {
  it('prefers an explicit workspace path over inherited cwd-like env vars', () => {
    const workspaceRoot = makeTempSrcRoot('maestro-workspace-');
    const inheritedPwd = makeTempSrcRoot('maestro-pwd-');

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
    const workspaceRoot = makeTempSrcRoot('maestro-pwd-root-');

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

  it('prefers a runtime-specific explicit workspace env over client roots and inherited cwd', () => {
    const workspaceRoot = makeTempSrcRoot('maestro-runtime-root-');
    const clientRoot = makeTempSrcRoot('maestro-client-root-');
    const inheritedPwd = makeTempSrcRoot('maestro-runtime-pwd-');

    const result = withEnv(
      {
        MAESTRO_WORKSPACE_PATH: workspaceRoot,
        CLAUDE_PROJECT_DIR: null,
        PWD: inheritedPwd,
        INIT_CWD: null,
      },
      () =>
        resolveProjectRootForRuntime(
          {
            env: {
              workspacePath: 'MAESTRO_WORKSPACE_PATH',
            },
          },
          {
            env: process.env,
            clientRoots: [{ uri: pathToFileURL(clientRoot).href, name: 'client-root' }],
            cwd: inheritedPwd,
          }
        )
    );

    assert.equal(result, workspaceRoot);
  });

  it('uses client roots when the runtime does not expose an explicit workspace env', () => {
    const clientRoot = makeTempSrcRoot('maestro-codex-root-');
    const inheritedPwd = makeTempSrcRoot('maestro-codex-pwd-');

    const result = withEnv(
      {
        MAESTRO_WORKSPACE_PATH: null,
        CLAUDE_PROJECT_DIR: null,
        PWD: inheritedPwd,
        INIT_CWD: null,
      },
      () =>
        resolveProjectRootForRuntime(
          {
            env: {
              workspacePath: 'MAESTRO_WORKSPACE_PATH',
            },
          },
          {
            env: process.env,
            clientRoots: [{ uri: pathToFileURL(clientRoot).href, name: 'workspace' }],
            cwd: inheritedPwd,
          }
        )
    );

    assert.equal(result, clientRoot);
  });

  it('preserves Claude workspace precedence over client roots', () => {
    const claudeRoot = makeTempSrcRoot('maestro-claude-root-');
    const clientRoot = makeTempSrcRoot('maestro-claude-client-');
    const inheritedPwd = makeTempSrcRoot('maestro-claude-pwd-');

    const result = withEnv(
      {
        MAESTRO_WORKSPACE_PATH: null,
        CLAUDE_PROJECT_DIR: claudeRoot,
        PWD: inheritedPwd,
        INIT_CWD: null,
      },
      () =>
        resolveProjectRootForRuntime(
          {
            env: {
              workspacePath: 'CLAUDE_PROJECT_DIR',
            },
          },
          {
            env: process.env,
            clientRoots: [{ uri: pathToFileURL(clientRoot).href, name: 'client-root' }],
            cwd: inheritedPwd,
          }
        )
    );

    assert.equal(result, claudeRoot);
  });

  const {
    requireExplicitWorkspaceRoot,
    WorkspaceResolutionError,
  } = require('../../src/core/project-root-resolver');

  it('requireExplicitWorkspaceRoot returns the explicit path when it exists', () => {
    const workspaceRoot = makeTempSrcRoot('maestro-explicit-');
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
    const cachePath = makeTempSrcRoot('.codex-plugins-cache-');
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

  it('workspaceSuggestion does not fall back to cwd', () => {
    const cwd = makeTempSrcRoot('maestro-cwd-suggestion-');
    const cache = createProjectRootCache({
      runtimeConfig: {
        env: {
          workspacePath: 'MAESTRO_WORKSPACE_PATH',
        },
      },
      env: {},
      getCwd: () => cwd,
    });

    assert.equal(cache.workspaceSuggestion(), null);
  });
});
