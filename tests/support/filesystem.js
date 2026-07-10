import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { REPO_ROOT } from './paths.js';

function makeTempDir(testContext, prefix = 'maestro-test-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  if (testContext) {
    testContext.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });
  }

  return root;
}

function writeFixtureFile(root, relativePath, content, encoding = 'utf8') {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, encoding);
  return filePath;
}

function normalizeCandidatePath(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0 || path.isAbsolute(candidate) || candidate.includes('\\')) {
    throw new Error(`Tracked-candidate path must be a non-empty repository-relative path: ${String(candidate)}`);
  }

  const normalized = path.posix.normalize(candidate);
  if (normalized !== candidate) {
    throw new Error(`Tracked-candidate path must be canonical: ${candidate}`);
  }
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Tracked-candidate path escapes the repository: ${candidate}`);
  }
  return normalized;
}

function isExcludedCandidatePath(relativePath) {
  return relativePath === '.git' || relativePath.startsWith('.git/') ||
    relativePath === 'node_modules' || relativePath.startsWith('node_modules/') ||
    relativePath === 'dist' || relativePath.startsWith('dist/') ||
    relativePath === 'src/generated' || relativePath.startsWith('src/generated/');
}

function assertAdditionalPathAllowed(relativePath) {
  if (isExcludedCandidatePath(relativePath)) {
    throw new Error(`Tracked-candidate additional path is excluded build residue: ${relativePath}`);
  }

  const ignored = spawnSync(
    'git',
    ['check-ignore', '--no-index', '--quiet', '--', relativePath],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  if (ignored.status === 0) {
    throw new Error(`Tracked-candidate additional path is ignored: ${relativePath}`);
  }
  if (ignored.status !== 1) {
    throw new Error(`Unable to check ignore status for tracked-candidate path: ${relativePath}`);
  }

  const sourcePath = path.join(REPO_ROOT, relativePath);
  if (fs.existsSync(sourcePath) && fs.lstatSync(sourcePath).isDirectory()) {
    throw new Error(`Tracked-candidate additional path must name a file: ${relativePath}`);
  }
}

function copyCandidateFile(relativePath, repoRoot) {
  const sourcePath = path.join(REPO_ROOT, relativePath);
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const targetPath = path.join(repoRoot, relativePath);
  const stat = fs.lstatSync(sourcePath);
  if (stat.isDirectory()) {
    throw new Error(`Tracked-candidate source unexpectedly resolved to a directory: ${relativePath}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (stat.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(sourcePath), targetPath);
    return;
  }
  fs.copyFileSync(sourcePath, targetPath);
  fs.chmodSync(targetPath, stat.mode);
}

function createTrackedCandidateRepoCopy({ additionalPaths = [], dependencyRoot } = {}) {
  if (!Array.isArray(additionalPaths)) {
    throw new Error('Tracked-candidate additionalPaths must be an array');
  }
  if (typeof dependencyRoot !== 'string' || dependencyRoot.length === 0 || !fs.existsSync(dependencyRoot)) {
    throw new Error('Tracked-candidate dependencyRoot must name an existing directory');
  }

  const dependencyRealPath = fs.realpathSync(dependencyRoot);
  if (!fs.statSync(dependencyRealPath).isDirectory()) {
    throw new Error('Tracked-candidate dependencyRoot must name an existing directory');
  }

  const additional = [...new Set(additionalPaths.map(normalizeCandidatePath))];
  for (const relativePath of additional) {
    assertAdditionalPathAllowed(relativePath);
  }

  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const candidatePaths = [...new Set([...tracked, ...additional])]
    .filter((relativePath) => !isExcludedCandidatePath(relativePath));

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-tracked-candidate-'));
  const repoRoot = path.join(tempRoot, 'repo');
  try {
    fs.mkdirSync(repoRoot, { recursive: true });
    for (const relativePath of candidatePaths) {
      copyCandidateFile(relativePath, repoRoot);
    }

    const dependencyRelativePath = path.relative(repoRoot, dependencyRealPath);
    if (dependencyRelativePath === '' || (!dependencyRelativePath.startsWith('..' + path.sep) && dependencyRelativePath !== '..')) {
      throw new Error('Tracked-candidate dependencyRoot must be outside the copied repository');
    }

    const linkedDependencyPath = path.join(repoRoot, 'node_modules');
    fs.symlinkSync(dependencyRealPath, linkedDependencyPath, 'dir');
    if (fs.realpathSync(linkedDependencyPath) !== dependencyRealPath) {
      throw new Error('Tracked-candidate dependency symlink resolved to an unexpected target');
    }
    return repoRoot;
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export { createTrackedCandidateRepoCopy, makeTempDir, writeFixtureFile };
