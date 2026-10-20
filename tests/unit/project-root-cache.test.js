'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { createProjectRootCache } = require('../../src/mcp/project-root-cache');
const { withCwd, withEnv } = require('../support/env');
const { makeTempDir } = require('../support/fs');

// The env var a runtime config's `env.workspacePath` would name.
const ENV_VAR = 'MAESTRO_TEST_WORKSPACE_SUGGESTION';

/** Creates a real directory (optionally nested) under a fresh temp root. */
function makeDir(...segments) {
  const root = fs.realpathSync(makeTempDir('maestro-root-cache-'));
  const dir = path.join(root, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Installed-plugin directories per host. Antigravity starts the MCP server
// with the installed plugin directory as its cwd.
const HOST_CACHE_DIRS = {
  claude: ['.claude', 'plugins', 'cache', 'maestro'],
  codex: ['.codex', 'plugins', 'cache', 'maestro'],
  antigravity: ['.gemini', 'config', 'plugins', 'maestro'],
  'antigravity-cli': ['.gemini', 'antigravity-cli', 'plugins', 'maestro'],
};

/** Creates a host plugin-cache directory, which must never be suggested as a workspace. */
function makeCacheDir(host = 'claude') {
  return makeDir(...HOST_CACHE_DIRS[host]);
}

/**
 * Builds a cache whose client answers roots/list with `roots`, or rejects when
 * `roots` is an Error. `requests()` counts roots/list round trips.
 */
function createCache({ roots = [] } = {}) {
  let requests = 0;
  const cache = createProjectRootCache({
    requestClientRoots: async () => {
      requests += 1;
      if (roots instanceof Error) throw roots;
      return { roots };
    },
  });
  return { cache, requests: () => requests };
}

async function createCacheWithRoots(roots) {
  const { cache } = createCache({ roots });
  cache.setClientSupportsRoots(true);
  await cache.refreshClientRoots();
  return cache;
}

describe('createProjectRootCache project root', () => {
  it('is null until a workspace path is set explicitly', () => {
    const { cache } = createCache();
    assert.equal(cache.getProjectRoot(), null);

    cache.setExplicitWorkspacePath('/ws/alpha');
    assert.equal(cache.getProjectRoot(), '/ws/alpha');
  });

  it('is not derived from the workspace suggestion', async () => {
    const workspace = makeDir('workspace');
    await withEnv({ [ENV_VAR]: workspace }, async () => {
      const cache = await createCacheWithRoots([pathToFileURL(workspace).href]);
      assert.equal(cache.workspaceSuggestion(ENV_VAR), workspace);
      assert.equal(cache.getProjectRoot(), null);
    });
  });
});

describe('createProjectRootCache workspaceSuggestion', () => {
  it('prefers the named env var over client roots and cwd', async () => {
    const envDir = makeDir('env');
    const rootDir = makeDir('root');
    const cwdDir = makeDir('cwd');

    await withEnv({ [ENV_VAR]: envDir }, async () => {
      const cache = await createCacheWithRoots([{ uri: pathToFileURL(rootDir).href }]);
      assert.equal(withCwd(cwdDir, () => cache.workspaceSuggestion(ENV_VAR)), envDir);
    });
  });

  it('ignores env values that are unexpanded placeholders or missing directories', async () => {
    const rootDir = makeDir('root');
    const cache = await createCacheWithRoots([{ uri: pathToFileURL(rootDir).href }]);

    for (const value of ['${workspacePath}', path.join(rootDir, 'missing')]) {
      withEnv({ [ENV_VAR]: value }, () => {
        assert.equal(cache.workspaceSuggestion(ENV_VAR), rootDir, `env value ${value}`);
      });
    }
  });

  it('uses the first existing, non-cache file:// client root', async () => {
    const rootDir = makeDir('root');
    const laterDir = makeDir('later');

    await withEnv({ [ENV_VAR]: null }, async () => {
      const cache = await createCacheWithRoots([
        'https://example.com/workspace',
        'not a uri',
        { name: 'no-uri' },
        { uri: pathToFileURL(path.join(rootDir, 'missing')).href },
        { uri: pathToFileURL(makeCacheDir('claude')).href },
        { uri: pathToFileURL(makeCacheDir('codex')).href },
        { uri: pathToFileURL(makeCacheDir('antigravity')).href },
        pathToFileURL(rootDir).href,
        { uri: pathToFileURL(laterDir).href },
      ]);
      assert.equal(cache.workspaceSuggestion(ENV_VAR), rootDir);
    });
  });

  it('falls back to cwd when neither env nor client roots apply', () => {
    const cwdDir = makeDir('cwd');
    const { cache } = createCache();

    withEnv({ [ENV_VAR]: null }, () => {
      assert.equal(withCwd(cwdDir, () => cache.workspaceSuggestion(ENV_VAR)), cwdDir);
    });
  });

  it('rejects extension-cache paths from env, client roots and cwd', async () => {
    for (const host of Object.keys(HOST_CACHE_DIRS)) {
      await withEnv({ [ENV_VAR]: makeCacheDir(host) }, async () => {
        const cache = await createCacheWithRoots([{ uri: pathToFileURL(makeCacheDir(host)).href }]);
        assert.equal(withCwd(makeCacheDir(host), () => cache.workspaceSuggestion(ENV_VAR)), null, host);
      });
    }
  });
});

describe('createProjectRootCache client roots', () => {
  it('does not request roots unless the client supports them', async () => {
    const rootDir = makeDir('root');
    const cwdDir = makeDir('cwd');
    const { cache, requests } = createCache({ roots: [pathToFileURL(rootDir).href] });

    await cache.refreshClientRoots();

    assert.equal(requests(), 0);
    withEnv({ [ENV_VAR]: null }, () => {
      assert.equal(withCwd(cwdDir, () => cache.workspaceSuggestion(ENV_VAR)), cwdDir);
    });
  });

  it('swallows roots/list failures and treats them as no roots', async () => {
    const cwdDir = makeDir('cwd');
    const { cache, requests } = createCache({ roots: new Error('client went away') });
    cache.setClientSupportsRoots(true);

    await cache.refreshClientRoots();

    assert.equal(requests(), 1);
    withEnv({ [ENV_VAR]: null }, () => {
      assert.equal(withCwd(cwdDir, () => cache.workspaceSuggestion(ENV_VAR)), cwdDir);
    });
  });

  it('replaces the cached roots with the latest list on every refresh', async () => {
    const firstDir = makeDir('first');
    const secondDir = makeDir('second');
    let roots = [pathToFileURL(firstDir).href];
    const cache = createProjectRootCache({ requestClientRoots: async () => ({ roots }) });
    cache.setClientSupportsRoots(true);

    await withEnv({ [ENV_VAR]: null }, async () => {
      await cache.refreshClientRoots();
      assert.equal(cache.workspaceSuggestion(ENV_VAR), firstDir);

      roots = [pathToFileURL(secondDir).href];
      await cache.refreshClientRoots();
      assert.equal(cache.workspaceSuggestion(ENV_VAR), secondDir);
    });
  });
});
