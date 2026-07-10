import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { importDist } from '../support/dist.js';
import { withEnvSync } from '../support/environment.js';
import { makeTempDir } from '../support/filesystem.js';

const {
  resolveProjectRoot,
  resolveProjectRootForRuntime,
  requireExplicitWorkspaceRoot,
  WorkspaceResolutionError,
} = await importDist('src/core/project-root-resolver.js');
const { createProjectRootCache } = await importDist('src/mcp/server/project-root-cache.js');

function makeGitWorkspace(t, prefix) {
  const root = makeTempDir(t, prefix);
  execFileSync('git', ['init', '--quiet', root]);
  return root;
}

describe('project root resolver', () => {
  it('prefers an explicit workspace path over inherited cwd-like env vars', (t) => {
    const workspaceRoot = makeTempDir(t, 'maestro-workspace-');
    const inheritedPwd = makeTempDir(t, 'maestro-pwd-');

    const result = withEnvSync(
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

  it('falls back to inherited PWD when MCP roots are unavailable', (t) => {
    const workspaceRoot = makeTempDir(t, 'maestro-pwd-root-');

    const result = withEnvSync(
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

  it('prefers a runtime-specific explicit workspace env over client roots and inherited cwd', (t) => {
    const workspaceRoot = makeTempDir(t, 'maestro-runtime-root-');
    const clientRoot = makeTempDir(t, 'maestro-client-root-');
    const inheritedPwd = makeTempDir(t, 'maestro-runtime-pwd-');

    const result = withEnvSync(
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

  it('uses client roots when the runtime does not expose an explicit workspace env', (t) => {
    const clientRoot = makeTempDir(t, 'maestro-codex-root-');
    const inheritedPwd = makeTempDir(t, 'maestro-codex-pwd-');

    const result = withEnvSync(
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

  it('skips missing and placeholder runtime candidates before using client roots', (t) => {
    const missingParent = makeTempDir(t, 'maestro-missing-runtime-parent-');
    const clientRoot = makeTempDir(t, 'maestro-valid-client-');

    for (const invalidValue of [
      path.join(missingParent, 'missing'),
      '${workspaceFolder}/project',
    ]) {
      const result = resolveProjectRootForRuntime(
        {
          env: {
            workspacePath: 'MAESTRO_WORKSPACE_PATH',
          },
        },
        {
          env: { MAESTRO_WORKSPACE_PATH: invalidValue },
          clientRoots: [{ uri: pathToFileURL(clientRoot).href }],
          cwd: missingParent,
        }
      );

      assert.equal(result, clientRoot);
    }
  });

  it('preserves client-root order while ignoring invalid URI candidates', (t) => {
    const missing = path.join(makeTempDir(t, 'maestro-client-parent-'), 'missing');
    const first = makeTempDir(t, 'maestro-client-first-');
    const second = makeTempDir(t, 'maestro-client-second-');

    const result = resolveProjectRootForRuntime(
      {},
      {
        env: {},
        clientRoots: [
          { uri: 'https://example.com/not-a-file-root' },
          { uri: pathToFileURL(missing).href },
          pathToFileURL(first).href,
          { uri: pathToFileURL(second).href },
        ],
        cwd: second,
      }
    );

    assert.equal(result, first);
  });

  it('decodes file URI roots before authoritative resolution', (t) => {
    const clientRoot = makeTempDir(t, 'maestro client root ');
    const result = resolveProjectRootForRuntime(
      {},
      {
        env: {},
        clientRoots: [{ uri: pathToFileURL(clientRoot).href }],
        cwd: path.dirname(clientRoot),
      }
    );

    assert.equal(result, clientRoot);
  });

  it('preserves Claude workspace precedence over client roots', (t) => {
    const claudeRoot = makeTempDir(t, 'maestro-claude-root-');
    const clientRoot = makeTempDir(t, 'maestro-claude-client-');
    const inheritedPwd = makeTempDir(t, 'maestro-claude-pwd-');

    const result = withEnvSync(
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

  it('requireExplicitWorkspaceRoot returns the explicit path when it exists', (t) => {
    const workspaceRoot = makeTempDir(t, 'maestro-explicit-');
    const result = requireExplicitWorkspaceRoot({ workspacePath: workspaceRoot });
    assert.equal(result, workspaceRoot);
  });

  it('canonicalizes authoritative candidates to their Git root', (t) => {
    const repository = makeGitWorkspace(t, 'maestro-git-workspace-');
    const nested = path.join(repository, 'packages', 'app');
    fs.mkdirSync(nested, { recursive: true });
    const expected = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: nested,
      encoding: 'utf8',
    }).trim();

    assert.equal(requireExplicitWorkspaceRoot({ workspacePath: nested }), expected);
    assert.equal(
      resolveProjectRootForRuntime({}, {
        env: {},
        clientRoots: [{ uri: pathToFileURL(nested).href }],
        cwd: nested,
      }),
      expected
    );
  });

  it('requireExplicitWorkspaceRoot throws WorkspaceResolutionError when no explicit path is given', () => {
    assert.throws(
      () => requireExplicitWorkspaceRoot({}),
      (err) =>
        err instanceof WorkspaceResolutionError &&
        err.code === 'WORKSPACE_REQUIRED' &&
        /explicit workspace_path/.test(err.message)
    );
  });

  it('requireExplicitWorkspaceRoot rejects unresolved placeholders as missing input', () => {
    assert.throws(
      () => requireExplicitWorkspaceRoot({ workspacePath: '${workspaceFolder}' }),
      (err) =>
        err instanceof WorkspaceResolutionError &&
        err.code === 'WORKSPACE_REQUIRED'
    );
  });

  it('requireExplicitWorkspaceRoot throws when the explicit path does not exist', (t) => {
    const missing = path.join(makeTempDir(t, 'maestro-missing-parent-'), 'missing');
    assert.throws(
      () => requireExplicitWorkspaceRoot({ workspacePath: missing }),
      (err) =>
        err instanceof WorkspaceResolutionError &&
        err.code === 'WORKSPACE_NOT_FOUND' &&
        err.details.workspace_path === missing
    );
  });

  it('requireExplicitWorkspaceRoot throws when the path is inside an extension cache', (t) => {
    const cachePath = makeTempDir(t, '.codex-plugins-cache-');
    const nested = path.join(
      path.dirname(cachePath),
      '.codex',
      'plugins',
      'maestro'
    );
    fs.mkdirSync(nested, { recursive: true });
    assert.throws(
      () => requireExplicitWorkspaceRoot({ workspacePath: nested }),
      (err) =>
        err instanceof WorkspaceResolutionError &&
        err.code === 'WORKSPACE_IN_EXTENSION_CACHE' &&
        err.details.workspace_path === nested &&
        /extension cache/i.test(err.message)
    );
  });

  it('workspaceSuggestion does not fall back to cwd', (t) => {
    const cwd = makeTempDir(t, 'maestro-cwd-suggestion-');
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

  it('workspaceSuggestion preserves a nested literal path instead of canonicalizing its Git root', (t) => {
    const repository = makeGitWorkspace(t, 'maestro-suggestion-git-');
    const nested = path.join(repository, 'packages', 'app');
    fs.mkdirSync(nested, { recursive: true });
    const cache = createProjectRootCache({
      runtimeConfig: {
        env: {
          workspacePath: 'MAESTRO_WORKSPACE_PATH',
        },
      },
      env: { MAESTRO_WORKSPACE_PATH: nested },
    });

    assert.equal(cache.workspaceSuggestion(), nested);
    assert.equal(cache.resolveProjectRoot(), null);
  });

  it('workspaceSuggestion skips cache roots and preserves client-root order', async (t) => {
    const root = makeTempDir(t, 'maestro-suggestion-roots-');
    const cacheRoot = path.join(root, '.codex', 'plugins', 'maestro');
    const firstWorkspace = path.join(root, 'first workspace');
    const secondWorkspace = path.join(root, 'second-workspace');
    fs.mkdirSync(cacheRoot, { recursive: true });
    fs.mkdirSync(firstWorkspace, { recursive: true });
    fs.mkdirSync(secondWorkspace, { recursive: true });
    const cache = createProjectRootCache({
      runtimeConfig: { env: { workspacePath: 'MAESTRO_WORKSPACE_PATH' } },
      env: { MAESTRO_WORKSPACE_PATH: cacheRoot },
      requestClientRoots: async () => ({
        roots: [
          { uri: pathToFileURL(cacheRoot).href },
          { uri: 'https://example.com/ignored' },
          { uri: pathToFileURL(firstWorkspace).href },
          { uri: pathToFileURL(secondWorkspace).href },
        ],
      }),
    });
    cache.setClientSupportsRoots(true);
    await cache.refreshClientRoots();

    assert.equal(cache.workspaceSuggestion(), firstWorkspace);
  });

  it('workspace suggestions never become an implicit stateful-tool fallback', async (t) => {
    const workspace = makeTempDir(t, 'maestro-suggestion-only-');
    const cache = createProjectRootCache({
      runtimeConfig: {
        env: {
          workspacePath: 'MAESTRO_WORKSPACE_PATH',
        },
      },
      env: { MAESTRO_WORKSPACE_PATH: workspace },
    });

    assert.equal(cache.workspaceSuggestion(), workspace);
    assert.equal(cache.resolveProjectRoot(), null);
    await assert.rejects(
      () => cache.getProjectRoot(),
      (err) => err.code === 'WORKSPACE_NOT_INITIALIZED'
    );

    cache.setExplicitWorkspacePath(workspace);
    assert.equal(cache.resolveProjectRoot(), workspace);
    assert.equal(await cache.getProjectRoot(), workspace);
  });
});
