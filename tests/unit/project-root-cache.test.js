'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { createProjectRootCache } = require('../../src/mcp/core/project-root-cache');
const { withCwd, withEnv } = require('../support/env');
const { makeTempDir } = require('../support/fs');

const ENV_VAR = 'MAESTRO_TEST_WORKSPACE_SUGGESTION';
const RUNTIME_CONFIG = { name: 'test', env: { workspacePath: ENV_VAR } };

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
function createCache({ roots = [], runtimeConfig = RUNTIME_CONFIG } = {}) {
  let requests = 0;
  const cache = createProjectRootCache({
    runtimeConfig,
    requestClientRoots: async () => {
      requests += 1;
      if (roots instanceof Error) throw roots;
      return { roots };
    },
  });
  return { cache, requests: () => requests };
}

async function createCacheWithRoots(roots, options) {
  const { cache } = createCache({ roots, ...options });
  cache.setClientSupportsRoots(true);
  await cache.refreshClientRoots();
  return cache;
}

/** `cache`'s suggestion with ENV_VAR set to `env` (null unsets it), run from `cwd`. */
function suggestionFrom(cache, cwd, env = null) {
  return withEnv({ [ENV_VAR]: env }, () => withCwd(cwd, () => cache.workspaceSuggestion()));
}

describe('createProjectRootCache project root', () => {
  it('is null until a workspace path is set explicitly', () => {
    const { cache } = createCache();
    assert.equal(cache.getProjectRoot(), null);

    cache.setExplicitWorkspacePath('/ws/alpha');
    assert.equal(cache.getProjectRoot(), '/ws/alpha');

    cache.setExplicitWorkspacePath('');
    assert.equal(cache.getProjectRoot(), null);
  });

  it('is not derived from the workspace suggestion', async () => {
    const workspace = makeDir('workspace');
    const cache = await createCacheWithRoots([pathToFileURL(workspace).href]);
    assert.equal(suggestionFrom(cache, makeDir('cwd'), workspace), workspace);
    assert.equal(cache.getProjectRoot(), null);
  });
});

describe('createProjectRootCache workspaceSuggestion', () => {
  it('prefers the runtime env var over client roots and cwd', async () => {
    const envDir = makeDir('env');
    const rootDir = makeDir('root');
    const cache = await createCacheWithRoots([{ uri: pathToFileURL(rootDir).href }]);

    assert.equal(suggestionFrom(cache, makeDir('cwd'), envDir), envDir);
  });

  it('does not read the cwd when the env var or a client root applies', async () => {
    const envDir = makeDir('env');
    const rootDir = makeDir('root');
    const cache = await createCacheWithRoots([pathToFileURL(rootDir).href]);
    const { cwd } = process;
    // A plugin update can delete the server's cwd, after which process.cwd() throws.
    process.cwd = () => assert.fail('process.cwd() was read');
    try {
      withEnv({ [ENV_VAR]: envDir }, () => assert.equal(cache.workspaceSuggestion(), envDir));
      withEnv({ [ENV_VAR]: null }, () => assert.equal(cache.workspaceSuggestion(), rootDir));
    } finally {
      process.cwd = cwd;
    }
  });

  it('ignores env values that are unexpanded placeholders or missing directories', async () => {
    const rootDir = makeDir('root');
    const cache = await createCacheWithRoots([{ uri: pathToFileURL(rootDir).href }]);

    for (const value of ['${workspacePath}', path.join(rootDir, 'missing')]) {
      assert.equal(suggestionFrom(cache, makeDir('cwd'), value), rootDir, `env value ${value}`);
    }
  });

  it('ignores the env var when the runtime declares no workspacePath variable', () => {
    const envDir = makeDir('env');
    const cwdDir = makeDir('cwd');
    const { cache } = createCache({ runtimeConfig: { name: 'test', env: { workspacePath: null } } });

    assert.equal(suggestionFrom(cache, cwdDir, envDir), cwdDir);
  });

  it('uses the first existing, non-cache file:// client root', async () => {
    const rootDir = makeDir('root');
    const laterDir = makeDir('later');
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

    assert.equal(suggestionFrom(cache, makeDir('cwd')), rootDir);
  });

  it('falls back to cwd when neither env nor client roots apply', () => {
    const cwdDir = makeDir('cwd');
    const { cache } = createCache();

    assert.equal(suggestionFrom(cache, cwdDir), cwdDir);
  });

  it('rejects extension-cache paths from env, client roots and cwd', async () => {
    for (const host of Object.keys(HOST_CACHE_DIRS)) {
      const cache = await createCacheWithRoots([{ uri: pathToFileURL(makeCacheDir(host)).href }]);
      assert.equal(suggestionFrom(cache, makeCacheDir(host), makeCacheDir(host)), null, host);
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
    assert.equal(suggestionFrom(cache, cwdDir), cwdDir);
  });

  it('swallows roots/list failures and treats them as no roots', async () => {
    const cwdDir = makeDir('cwd');
    const { cache, requests } = createCache({ roots: new Error('client went away') });
    cache.setClientSupportsRoots(true);

    await cache.refreshClientRoots();

    assert.equal(requests(), 1);
    assert.equal(suggestionFrom(cache, cwdDir), cwdDir);
  });

  it('replaces the cached roots with the latest list on every refresh', async () => {
    const firstDir = makeDir('first');
    const secondDir = makeDir('second');
    const cwdDir = makeDir('cwd');
    let roots = [pathToFileURL(firstDir).href];
    const cache = createProjectRootCache({
      runtimeConfig: RUNTIME_CONFIG,
      requestClientRoots: async () => ({ roots }),
    });
    cache.setClientSupportsRoots(true);

    await cache.refreshClientRoots();
    assert.equal(suggestionFrom(cache, cwdDir), firstDir);

    roots = [pathToFileURL(secondDir).href];
    await cache.refreshClientRoots();
    assert.equal(suggestionFrom(cache, cwdDir), secondDir);
  });
});
