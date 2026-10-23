'use strict';

const fs = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const { makeTempDir, removeDir } = require('../support/fs');
const { ROOT } = require('../support/paths');

const DRY_RUN_MARKER = '(dry-run — no files written)';
const STATUS_LINE = /^\[(CREATE|UPDATE|UNCHANGED|REMOVE)\] /;

function generatorEnv() {
  return {
    ...process.env,
    NODE_PATH: [path.join(ROOT, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
  };
}

function runGenerator(args = [], options = {}) {
  const cwd = options.cwd || ROOT;

  return execFileSync(process.execPath, ['scripts/generate.js', ...args], {
    cwd,
    env: generatorEnv(),
    encoding: 'utf8',
  });
}

function runGeneratorExpectFailure(args = [], options = {}) {
  const result = spawnSync(process.execPath, ['scripts/generate.js', ...args], {
    cwd: options.cwd || ROOT,
    env: generatorEnv(),
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status === 0) {
    throw new Error('Expected generator command to fail');
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function getGitStatus() {
  return execFileSync('git', ['status', '--short', '--untracked-files=all'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trimEnd();
}

function parseDryRunReport(output) {
  const lines = output.trimEnd().split('\n').filter(Boolean);
  const marker = lines.at(-1);
  const statusLines = lines.filter((line) => STATUS_LINE.test(line));
  const outputPaths = statusLines.map((line) => line.replace(STATUS_LINE, ''));
  const driftLines = statusLines.filter((line) => !line.startsWith('[UNCHANGED] '));
  const nonStatusLines = lines.filter((line) => line !== DRY_RUN_MARKER && !STATUS_LINE.test(line));

  return {
    marker,
    statusLines,
    outputPaths,
    driftLines,
    nonStatusLines,
  };
}

/**
 * Copies the repo's `sourceDir` to `installSegments` under a fresh temp dir,
 * runs `fn` against the copy and removes the temp dir afterwards, even when
 * `fn` throws or rejects.
 */
async function withPluginCopy(prefix, sourceDir, installSegments, fn) {
  const tempRoot = makeTempDir(prefix);
  const pluginRoot = path.join(tempRoot, ...installSegments);

  fs.cpSync(path.join(ROOT, sourceDir), pluginRoot, { recursive: true });

  try {
    return await fn(pluginRoot);
  } finally {
    removeDir(tempRoot);
  }
}

/** Runs `fn` against a copy of plugins/maestro/ installed as a standalone plugin. */
function withIsolatedCodexPlugin(fn) {
  return withPluginCopy('maestro-codex-plugin-', 'plugins/maestro', ['maestro'], fn);
}

/** Runs `fn` against a copy of claude/ installed as a standalone plugin. */
function withIsolatedClaudePlugin(fn) {
  return withPluginCopy('maestro-claude-plugin-', 'claude', ['maestro'], fn);
}

/**
 * Runs `fn` against a copy of antigravity/ at the path `agy plugin install`
 * uses (~/.gemini/config/plugins/maestro/ under a temp home), where the shim
 * cannot reach the repo src/ and must run the bundled antigravity/src/.
 */
function withIsolatedAntigravityPlugin(fn) {
  return withPluginCopy(
    'maestro-antigravity-home-',
    'antigravity',
    ['.gemini', 'config', 'plugins', 'maestro'],
    fn
  );
}

function createTempRepoCopy(prefix = 'maestro-repo-copy-') {
  const tempRoot = makeTempDir(prefix);
  const repoRoot = path.join(tempRoot, 'repo');

  fs.cpSync(ROOT, repoRoot, {
    recursive: true,
    filter: (source) => {
      const relativePath = path.relative(ROOT, source);

      if (!relativePath) {
        return true;
      }

      return !relativePath.split(path.sep).some((part) => part === '.git' || part === 'node_modules');
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
  DRY_RUN_MARKER,
  ROOT,
  createTempRepoCopy,
  getGitStatus,
  parseDryRunReport,
  runGenerator,
  runGeneratorExpectFailure,
  withIsolatedAntigravityPlugin,
  withIsolatedClaudePlugin,
  withIsolatedCodexPlugin,
  withTempRepoCopy,
};
