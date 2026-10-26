'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { makeTempDir, removeDir } = require('../support/fs');
const { ROOT } = require('../support/paths');
const { runNode, runNodeOk } = require('../support/process');

function generatorEnv() {
  return {
    ...process.env,
    NODE_PATH: [path.join(ROOT, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
  };
}

function runGenerator(args = [], { cwd } = {}) {
  return runNodeOk('scripts/generate.js', args, { cwd, env: generatorEnv() });
}

function runGeneratorExpectFailure(args = [], { cwd } = {}) {
  const result = runNode('scripts/generate.js', args, { cwd, env: generatorEnv() });

  if (result.error) {
    throw result.error;
  }

  assert.notEqual(result.status, 0, 'Expected generator command to fail');
  return result;
}

function createTempRepoCopy(prefix = 'maestro-repo-copy-') {
  const tempRoot = makeTempDir(prefix);
  const repoRoot = path.join(tempRoot, 'repo');

  fs.cpSync(ROOT, repoRoot, {
    recursive: true,
    filter: (source) => {
      const parts = path.relative(ROOT, source).split(path.sep);
      // A repository fixture must not inherit archives from a local release build.
      return parts[0] !== 'dist' && !parts.some((part) => part === '.git' || part === 'node_modules');
    },
  });

  return repoRoot;
}

/**
 * Runs `fn` against a temporary copy of the repository and removes the copy
 * afterwards, even when `fn` throws. `fn` must be synchronous because the copy
 * is removed as soon as `fn` returns.
 *
 * @template T
 * @param {string} prefix - Prefix for the temporary directory name
 * @param {(repoRoot: string) => T} fn - Synchronous callback receiving the copied repository root
 * @returns {T} The callback's result
 */
function withTempRepoCopy(prefix, fn) {
  const repoRoot = createTempRepoCopy(prefix);

  try {
    return fn(repoRoot);
  } finally {
    removeDir(path.dirname(repoRoot));
  }
}

module.exports = {
  createTempRepoCopy,
  runGenerator,
  runGeneratorExpectFailure,
  withTempRepoCopy,
};
