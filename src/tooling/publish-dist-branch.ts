#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
import { moduleDirname } from '../core/package-root.js';
import { resolvePackageRoot } from '../core/package-root.js';
import { readJson, runAsMain } from './lib/cli.js';
const ROOT = resolvePackageRoot(moduleDirname(import.meta.url), { malformedJson: 'throw' });
const CURRENT_DIST_ROOT = path.join(ROOT, 'dist');

const COMMIT_IDENTITY = Object.freeze({
  GIT_AUTHOR_NAME: 'maestro-release-bot',
  GIT_AUTHOR_EMAIL: 'maestro-release-bot@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'maestro-release-bot',
  GIT_COMMITTER_EMAIL: 'maestro-release-bot@users.noreply.github.com',
});

type ExecFileOptions = Omit<ExecFileSyncOptionsWithStringEncoding, 'encoding'>;

type PublishOptions = {
  root?: string;
};

function git(cwd: string, args: string[], options: ExecFileOptions = {}): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    ...options,
  }).trim();
}

function gitQuiet(cwd: string, args: string[], options: ExecFileOptions = {}): string | null {
  try {
    return git(cwd, args, options);
  } catch (error) {
    return null;
  }
}

function assertCleanTrackedState(root: string): void {
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=no']);

  if (status !== '') {
    throw new Error(
      `Refusing to publish dist branch snapshot: tracked working tree is dirty:\n${status}`
    );
  }
}

function ensureCompiledRuntime(worktreePath: string): void {
  const targetDist = path.join(worktreePath, 'dist');
  if (!fs.existsSync(CURRENT_DIST_ROOT)) {
    throw new Error(`Compiled dist runtime is missing: ${CURRENT_DIST_ROOT}`);
  }
  fs.rmSync(targetDist, { recursive: true, force: true });
  fs.cpSync(CURRENT_DIST_ROOT, targetDist, { recursive: true });
}

function linkGeneratorDependency(root: string, worktreePath: string): void {
  const dependencyRoot = path.join(root, 'node_modules', 'zod');
  if (!fs.existsSync(dependencyRoot)) {
    throw new Error(`Installed generator dependency is missing: ${dependencyRoot}`);
  }

  const dependencyRealPath = fs.realpathSync(dependencyRoot);
  if (!fs.statSync(dependencyRealPath).isDirectory()) {
    throw new Error(`Installed generator dependency must be a directory: ${dependencyRoot}`);
  }

  const worktreeRealPath = fs.realpathSync(worktreePath);
  const dependencyRelativePath = path.relative(worktreeRealPath, dependencyRealPath);
  if (
    dependencyRelativePath === ''
    || (!dependencyRelativePath.startsWith(`..${path.sep}`) && dependencyRelativePath !== '..')
  ) {
    throw new Error('Installed generator dependency must be outside the temporary worktree');
  }

  if (git(worktreePath, ['ls-files', '--', 'node_modules']) !== '') {
    throw new Error('Temporary worktree node_modules path must be untracked');
  }

  const nodeModulesPath = path.join(worktreePath, 'node_modules');
  if (fs.lstatSync(nodeModulesPath, { throwIfNoEntry: false })) {
    throw new Error(`Temporary worktree dependency directory already exists: ${nodeModulesPath}`);
  }
  fs.mkdirSync(nodeModulesPath);
  if (gitQuiet(worktreePath, ['check-ignore', '--no-index', '--quiet', '--', 'node_modules/']) === null) {
    throw new Error('Temporary worktree node_modules directory must be ignored');
  }

  const linkedDependencyPath = path.join(nodeModulesPath, 'zod');
  fs.symlinkSync(dependencyRealPath, linkedDependencyPath, 'dir');
  if (
    !fs.lstatSync(linkedDependencyPath).isSymbolicLink()
    || fs.realpathSync(linkedDependencyPath) !== dependencyRealPath
  ) {
    throw new Error('Temporary worktree Zod symlink resolved to an unexpected target');
  }
  if (gitQuiet(worktreePath, ['check-ignore', '--no-index', '--quiet', '--', 'node_modules/zod']) === null) {
    throw new Error('Temporary worktree Zod symlink must be ignored');
  }
  if (git(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all', '--', 'node_modules']) !== '') {
    throw new Error('Temporary worktree generator dependencies must remain ignored');
  }
}

function listGeneratorOutputs(worktreePath: string): string[] {
  const output = execFileSync(
    process.execPath,
    [path.join(worktreePath, 'dist', 'src', 'tooling', 'generate.js'), '--list-outputs'],
    { cwd: worktreePath, encoding: 'utf8' }
  );

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function runGeneratorWriteMode(worktreePath: string): void {
  execFileSync(process.execPath, [path.join(worktreePath, 'dist', 'src', 'tooling', 'generate.js')], {
    cwd: worktreePath,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

function createTemporaryWorktree(root: string): { worktreePath: string; parentDir: string } {
  gitQuiet(root, ['worktree', 'prune']);

  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-dist-worktree-'));
  const worktreePath = path.join(parentDir, 'worktree');

  git(root, ['worktree', 'add', '--detach', worktreePath, 'HEAD']);

  return { worktreePath, parentDir };
}

function removeTemporaryWorktree(root: string, worktreePath: string, parentDir: string): void {
  gitQuiet(root, ['worktree', 'remove', '--force', worktreePath]);
  fs.rmSync(parentDir, { recursive: true, force: true });
  gitQuiet(root, ['worktree', 'prune']);
}

function buildOrphanSnapshotCommit(root: string, worktreePath: string, version: string): string {
  ensureCompiledRuntime(worktreePath);
  linkGeneratorDependency(root, worktreePath);
  runGeneratorWriteMode(worktreePath);
  const outputs = listGeneratorOutputs(worktreePath);

  git(worktreePath, ['add', '-A']);

  for (const outputPath of outputs) {
    git(worktreePath, ['add', '-f', '--', outputPath]);
  }

  if (git(worktreePath, ['ls-files', '--cached', '--', 'node_modules']) !== '') {
    throw new Error('Temporary worktree dependencies must not enter the dist snapshot index');
  }

  const treeSha = git(worktreePath, ['write-tree']);

  return git(
    worktreePath,
    ['commit-tree', treeSha, '-m', `dist: v${version} generated snapshot`],
    { env: { ...process.env, ...COMMIT_IDENTITY } }
  );
}

function publishDistBranch(options: PublishOptions = {}): { sha: string; version: string } {
  const root = options.root || ROOT;

  assertCleanTrackedState(root);

  const { worktreePath, parentDir } = createTemporaryWorktree(root);

  try {
    const version = readJson(path.join(worktreePath, 'package.json')).version;
    const sha = buildOrphanSnapshotCommit(root, worktreePath, version);

    return { sha, version };
  } finally {
    removeTemporaryWorktree(root, worktreePath, parentDir);
  }
}

runAsMain(import.meta.url, 'dist branch publish', () => {
  const result = publishDistBranch();
  console.log(result.sha);
});

export { publishDistBranch };
