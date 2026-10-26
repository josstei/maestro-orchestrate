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
 * Runs `fn`, then `restore` once `fn` returns, throws, or (when it returns a
 * promise) settles; a returned promise is chained so the caller awaits both.
 */
function runThenRestore(fn, restore) {
  let result;
  try {
    result = fn();
    return typeof result?.then === 'function' ? result.finally(restore) : result;
  } finally {
    if (typeof result?.then !== 'function') restore();
  }
}

/** Sets each key of `values` in process.env, deleting it for a null or undefined value. */
function assignEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

/**
 * Runs `fn` (as runThenRestore does) with `process.env` temporarily
 * overridden; a null or undefined override deletes the key. Every overridden
 * key is restored to its previous value afterwards.
 */
function withEnv(overrides, fn) {
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  assignEnv(overrides);
  return runThenRestore(fn, () => assignEnv(previous));
}

/** Runs `fn` (as runThenRestore does) with the process cwd changed to `dir`. */
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
