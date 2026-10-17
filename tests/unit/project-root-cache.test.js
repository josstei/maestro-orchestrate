'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { createProjectRootCache } = require('../../src/mcp/core/project-root-cache');
const { withEnv } = require('../support/env');
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

function makeCacheDir() {
  return makeDir('.gemini', 'extensions', 'maestro');
}

function withCwd(dir, fn) {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(previous);
  }
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

describe('createProjectRootCache project root', () => {
  it('is null until a workspace path is set explicitly', async () => {
    const { cache } = createCache();
    assert.equal(await cache.getProjectRoot(), null);

    cache.setExplicitWorkspacePath('/ws/alpha');
    assert.equal(await cache.getProjectRoot(), '/ws/alpha');

    cache.setExplicitWorkspacePath('');
    assert.equal(await cache.getProjectRoot(), null);
  });

  it('is not derived from the workspace suggestion', async () => {
    const workspace = makeDir('workspace');
    await withEnv({ [ENV_VAR]: workspace }, async () => {
      const cache = await createCacheWithRoots([pathToFileURL(workspace).href]);
      assert.equal(cache.workspaceSuggestion(), workspace);
      assert.equal(await cache.getProjectRoot(), null);
    });
  });
});

describe('createProjectRootCache workspaceSuggestion', () => {
  it('prefers the runtime env var over client roots and cwd', async () => {
    const envDir = makeDir('env');
    const rootDir = makeDir('root');
    const cwdDir = makeDir('cwd');

    await withEnv({ [ENV_VAR]: envDir }, async () => {
      const cache = await createCacheWithRoots([{ uri: pathToFileURL(rootDir).href }]);
      assert.equal(withCwd(cwdDir, () => cache.workspaceSuggestion()), envDir);
    });
  });

  it('ignores env values that are unexpanded placeholders or missing directories', async () => {
    const rootDir = makeDir('root');
    const cache = await createCacheWithRoots([{ uri: pathToFileURL(rootDir).href }]);

    for (const value of ['${workspacePath}', path.join(rootDir, 'missing')]) {
      withEnv({ [ENV_VAR]: value }, () => {
        assert.equal(cache.workspaceSuggestion(), rootDir, `env value ${value}`);
      });
    }
  });

  it('ignores the env var when the runtime declares no workspacePath variable', () => {
    const envDir = makeDir('env');
    const cwdDir = makeDir('cwd');
    const { cache } = createCache({ runtimeConfig: { name: 'test', env: { workspacePath: null } } });

    withEnv({ [ENV_VAR]: envDir }, () => {
      assert.equal(withCwd(cwdDir, () => cache.workspaceSuggestion()), cwdDir);
    });
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
        { uri: pathToFileURL(makeCacheDir()).href },
        pathToFileURL(rootDir).href,
        { uri: pathToFileURL(laterDir).href },
      ]);
      assert.equal(cache.workspaceSuggestion(), rootDir);
    });
  });

  it('falls back to cwd when neither env nor client roots apply', () => {
    const cwdDir = makeDir('cwd');
    const { cache } = createCache();

    withEnv({ [ENV_VAR]: null }, () => {
      assert.equal(withCwd(cwdDir, () => cache.workspaceSuggestion()), cwdDir);
    });
  });

  it('rejects extension-cache paths from env, client roots and cwd', async () => {
    await withEnv({ [ENV_VAR]: makeCacheDir() }, async () => {
      const cache = await createCacheWithRoots([{ uri: pathToFileURL(makeCacheDir()).href }]);
      assert.equal(withCwd(makeCacheDir(), () => cache.workspaceSuggestion()), null);
    });
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
      assert.equal(withCwd(cwdDir, () => cache.workspaceSuggestion()), cwdDir);
    });
  });

  it('swallows roots/list failures and treats them as no roots', async () => {
    const cwdDir = makeDir('cwd');
    const { cache, requests } = createCache({ roots: new Error('client went away') });
    cache.setClientSupportsRoots(true);

    await cache.refreshClientRoots();

    assert.equal(requests(), 1);
    withEnv({ [ENV_VAR]: null }, () => {
      assert.equal(withCwd(cwdDir, () => cache.workspaceSuggestion()), cwdDir);
    });
  });

  it('forgets cached roots on invalidateClientRoots', async () => {
    const rootDir = makeDir('root');
    const cwdDir = makeDir('cwd');

    await withEnv({ [ENV_VAR]: null }, async () => {
      const cache = await createCacheWithRoots([pathToFileURL(rootDir).href]);
      assert.equal(cache.workspaceSuggestion(), rootDir);

      cache.invalidateClientRoots();
      assert.equal(withCwd(cwdDir, () => cache.workspaceSuggestion()), cwdDir);
    });
  });
});
