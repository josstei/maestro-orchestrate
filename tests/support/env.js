'use strict';

const fs = require('node:fs');
const os = require('node:os');

const { EXTENSION_ROOT_ENV_VARS } = require('../../src/config/setting-resolver');
const { WORKSPACE_ENV_VARS } = require('../../src/core/project-root-resolver');

/**
 * Keep temp workspaces from resolving to an enclosing checkout: git (and the
 * hooks and scripts that ask it for a toplevel) stops searching at the real
 * temp root, so a fixture dir never resolves to a repo the temp dir happens to
 * live inside.
 */
const ISOLATED_GIT_ENV = Object.freeze({
  GIT_CEILING_DIRECTORIES: fs.realpathSync(os.tmpdir()),
});

/**
 * Host variables src reads to locate the workspace or the extension root.
 * They come from src itself, so the scrub below cannot fall behind it.
 */
const HOST_ENV_VARS = [...WORKSPACE_ENV_VARS, ...EXTENSION_ROOT_ENV_VARS];

/**
 * Runs `fn` and calls `restore` once it is done. When `fn` returns a promise,
 * `restore` runs once that promise settles and the chained promise is
 * returned. When `fn` throws synchronously, `restore` runs and the error is
 * rethrown.
 *
 * @template T
 * @param {() => T} fn - Callback to run
 * @param {() => void} restore - Cleanup to run after `fn` finishes
 * @returns {T} The callback's result
 */
function runThenRestore(fn, restore) {
  let result;
  try {
    result = fn();
  } catch (error) {
    restore();
    throw error;
  }

  if (result && typeof result.then === 'function') {
    return result.then(
      (value) => {
        restore();
        return value;
      },
      (error) => {
        restore();
        throw error;
      }
    );
  }

  restore();
  return result;
}

/**
 * Runs `fn` with `process.env` temporarily overridden, then restores every
 * overridden key to its previous value. A null or undefined override deletes
 * the key. When `fn` returns a promise, the environment is restored once that
 * promise settles and the chained promise is returned. When `fn` throws
 * synchronously, the environment is restored and the error is rethrown.
 *
 * @template T
 * @param {Record<string, string | null | undefined>} overrides - Environment values to apply
 * @param {() => T} fn - Callback to run while the overrides are in place
 * @returns {T} The callback's result
 */
function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
  }

  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return runThenRestore(fn, restore);
}

/**
 * Runs `fn` with the process cwd changed to `dir`, then changes back to the
 * previous cwd. When `fn` returns a promise, the cwd is restored once that
 * promise settles and the chained promise is returned. When `fn` throws
 * synchronously, the cwd is restored and the error is rethrown.
 *
 * @template T
 * @param {string} dir - Directory to run `fn` in
 * @param {() => T} fn - Callback to run while `dir` is the cwd
 * @returns {T} The callback's result
 */
function withCwd(dir, fn) {
  const previous = process.cwd();
  process.chdir(dir);
  return runThenRestore(fn, () => process.chdir(previous));
}

/**
 * Returns a copy of process.env for a child that runs in `cwd` and must
 * resolve it as its workspace: every inherited MAESTRO_* variable and every
 * HOST_ENV_VARS entry is cleared, PWD names `cwd`, NODE_PATH is emptied and
 * git stops at the temp root. `set` is applied last. Cleared keys are left
 * undefined rather than deleted, so they also clear the inherited values when
 * the result is merged over process.env (as withMcpClient merges its `env`).
 *
 * @param {string} cwd - Directory the child runs in
 * @param {Record<string, string | undefined>} [set={}] - Variables to set afterwards
 * @returns {Record<string, string | undefined>} The child environment
 */
function hermeticEnv(cwd, set = {}) {
  const env = { ...process.env, ...ISOLATED_GIT_ENV };
  for (const key of Object.keys(env)) {
    if (key.startsWith('MAESTRO_') || HOST_ENV_VARS.includes(key)) env[key] = undefined;
  }
  return { ...env, PWD: cwd, NODE_PATH: '', ...set };
}

module.exports = {
  ISOLATED_GIT_ENV,
  hermeticEnv,
  withCwd,
  withEnv,
};
