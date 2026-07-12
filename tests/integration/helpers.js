import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { assertDistBuilt } from '../support/dist.js';
import { REPO_ROOT, repoPath } from '../support/paths.js';

const ROOT = REPO_ROOT;
const DRY_RUN_MARKER = '(dry-run — no files written)';
const STATUS_LINE = /^\[(CREATE|UPDATE|UNCHANGED)\] /;

function runGenerator(args = [], options = {}) {
  const cwd = options.cwd || ROOT;
  assertDistBuilt(['src/tooling/generate.js']);

  return execFileSync('node', ['dist/src/tooling/generate.js', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function runGeneratorExpectFailure(args = [], options = {}) {
  try {
    runGenerator(args, options);
    throw new Error('Expected generator command to fail');
  } catch (error) {
    if (error.message === 'Expected generator command to fail') {
      throw error;
    }

    return {
      status: error.status,
      stdout: error.stdout ? String(error.stdout) : '',
      stderr: error.stderr ? String(error.stderr) : '',
    };
  }
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

async function withPackagedClaudeRuntime(fn) {
  assertDistBuilt();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-claude-runtime-'));
  const packageRoot = path.join(tempRoot, 'maestro');

  fs.mkdirSync(packageRoot, { recursive: true });
  fs.cpSync(repoPath('.claude-plugin'), path.join(packageRoot, '.claude-plugin'), {
    recursive: true,
  });
  fs.cpSync(repoPath('claude'), path.join(packageRoot, 'claude'), { recursive: true });
  fs.cpSync(repoPath('dist'), path.join(packageRoot, 'dist'), { recursive: true });
  fs.cpSync(repoPath('src'), path.join(packageRoot, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: '@josstei/maestro', type: 'module' }, null, 2) + '\n',
    'utf8'
  );
  fs.symlinkSync(repoPath('node_modules'), path.join(packageRoot, 'node_modules'), 'dir');

  try {
    return await fn(packageRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function createTempRepoCopy(prefix = 'maestro-repo-copy-') {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const repoRoot = path.join(tempRoot, 'repo');

  fs.cpSync(ROOT, repoRoot, {
    recursive: true,
    filter: (source) => {
      const relativePath = path.relative(ROOT, source);

      if (!relativePath) {
        return true;
      }

      return !relativePath.split(path.sep).includes('.git');
    },
  });

  return repoRoot;
}

export { DRY_RUN_MARKER, ROOT, createTempRepoCopy, getGitStatus, parseDryRunReport, runGenerator, runGeneratorExpectFailure, withPackagedClaudeRuntime };
