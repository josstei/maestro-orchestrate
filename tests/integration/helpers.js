const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const DRY_RUN_MARKER = '(dry-run — no files written)';
const STATUS_LINE = /^\[(CREATE|UPDATE|UNCHANGED)\] /;

function runGenerator(args = []) {
  return execFileSync('node', ['scripts/generate.js', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
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
  const driftLines = statusLines.filter((line) => !line.startsWith('[UNCHANGED] '));
  const nonStatusLines = lines.filter((line) => line !== DRY_RUN_MARKER && !STATUS_LINE.test(line));

  return {
    marker,
    statusLines,
    driftLines,
    nonStatusLines,
  };
}

async function withIsolatedCodexPlugin(fn) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-codex-plugin-'));
  const pluginRoot = path.join(tempRoot, 'maestro');

  fs.cpSync(path.join(ROOT, 'plugins', 'maestro'), pluginRoot, { recursive: true });

  try {
    return await fn(pluginRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function withIsolatedClaudePlugin(fn) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-claude-plugin-'));
  const pluginRoot = path.join(tempRoot, 'maestro');

  fs.cpSync(path.join(ROOT, 'claude'), pluginRoot, { recursive: true });

  try {
    return await fn(pluginRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = {
  DRY_RUN_MARKER,
  ROOT,
  getGitStatus,
  parseDryRunReport,
  runGenerator,
  withIsolatedClaudePlugin,
  withIsolatedCodexPlugin,
};
