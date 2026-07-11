import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { atomicWriteSync } from '../lib/io/index.js';
const DEFAULT_STATE_DIR = 'docs/maestro';
const STATE_DIR_CHILDREN = [
  'state',
  path.join('state', 'archive'),
  'plans',
  path.join('plans', 'archive'),
  'memory',
  'knowledge',
];

type StateDirContext = {
  readonly projectRoot: string;
  readonly stateDirPath: string;
};

const stateDirContext = new AsyncLocalStorage<StateDirContext>();

function validateRelativePath(filePath: any) {
  if (path.isAbsolute(filePath)) {
    throw new Error('Path must be relative');
  }
  const segments = filePath.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
}

function canonicalizeProspectivePath(candidate: any) {
  let cursor = path.resolve(candidate);
  const missingSegments = [];

  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missingSegments.unshift(path.basename(cursor));
    cursor = parent;
  }

  try {
    cursor = fs.realpathSync(cursor);
  } catch {}

  return path.join(cursor, ...missingSegments);
}

function assertNoSymlinkComponents(absolutePath: any, rootDir: any) {
  const lexicalRoot = path.resolve(rootDir);
  const lexicalTarget = path.resolve(absolutePath);
  const relative = path.relative(lexicalRoot, lexicalTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;

  let cursor = lexicalRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) break;
    if (fs.lstatSync(cursor).isSymbolicLink()) {
      throw new Error('state_dir must not contain symbolic links');
    }
  }
}

function validateContainment(absolutePath: any, rootDir: any) {
  assertNoSymlinkComponents(absolutePath, rootDir);
  const resolved = canonicalizeProspectivePath(absolutePath);
  const resolvedRoot = canonicalizeProspectivePath(rootDir);
  const rootPrefix = resolvedRoot + path.sep;
  if (!resolved.startsWith(rootPrefix) && resolved !== resolvedRoot) {
    throw new Error('state_dir must be within the project root');
  }
  return resolved;
}

function validateStateDirTree(stateDirPath: string, projectRoot: string): string {
  const resolved = validateContainment(stateDirPath, projectRoot);
  for (const child of STATE_DIR_CHILDREN) {
    validateContainment(path.join(stateDirPath, child), projectRoot);
  }
  return resolved;
}

function runWithStateDirContext<T>(
  projectRoot: string | null,
  stateDirPath: string | null,
  operation: () => T,
): T {
  if (!projectRoot || !stateDirPath) {
    return operation();
  }
  return stateDirContext.run({ projectRoot, stateDirPath }, operation);
}

function resolveStateDirPath(cwd: any, stateDirOverride?: any) {
  const base = cwd || process.cwd();
  const activeContext = stateDirContext.getStore();
  if (
    !stateDirOverride &&
    activeContext &&
    canonicalizeProspectivePath(activeContext.projectRoot) === canonicalizeProspectivePath(base)
  ) {
    validateStateDirTree(activeContext.stateDirPath, base);
    return activeContext.stateDirPath;
  }

  const stateDir = stateDirOverride || process.env.MAESTRO_STATE_DIR || DEFAULT_STATE_DIR;

  if (path.isAbsolute(stateDir)) {
    return validateStateDirTree(stateDir, base);
  }

  validateRelativePath(stateDir);
  const stateDirPath = path.join(base, stateDir);
  validateStateDirTree(stateDirPath, base);
  return stateDirPath;
}

function resolveActiveSessionPath(cwd: any) {
  return path.join(resolveStateDirPath(cwd), 'state', 'active-session.md');
}

function hasActiveSession(cwd: any) {
  try {
    const sessionPath = resolveActiveSessionPath(cwd);
    return fs.existsSync(sessionPath);
  } catch {
    return false;
  }
}

function readState(relativePath: any, basePath: any) {
  validateRelativePath(relativePath);
  const fullPath = path.join(basePath, relativePath);
  const activeContext = stateDirContext.getStore();
  if (activeContext) {
    validateContainment(fullPath, activeContext.projectRoot);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function writeState(relativePath: any, content: any, basePath: any) {
  validateRelativePath(relativePath);
  const fullPath = path.join(basePath, relativePath);
  const activeContext = stateDirContext.getStore();
  if (activeContext) {
    validateContainment(fullPath, activeContext.projectRoot);
  }
  atomicWriteSync(fullPath, content);
}

function ensureWorkspace(stateDir: any, basePath: any) {
  const fullBase = resolveStateDirPath(basePath, stateDir);
  fs.mkdirSync(fullBase, { recursive: true, mode: 0o700 });
  const canonicalBase = validateContainment(fullBase, basePath);
  const stats = fs.lstatSync(canonicalBase);
  if (stats.isSymbolicLink()) {
    throw new Error('STATE_DIR must not be a symlink');
  }
  const dirs = [
    path.join(fullBase, 'state'),
    path.join(fullBase, 'state', 'archive'),
    path.join(fullBase, 'plans'),
    path.join(fullBase, 'plans', 'archive'),
    path.join(fullBase, 'memory'),
    path.join(fullBase, 'knowledge'),
  ];
  for (const dir of dirs) {
    validateContainment(dir, basePath);
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {
      throw new Error('Failed to create workspace directory');
    }
    validateContainment(dir, basePath);
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new Error('Workspace directory not writable');
    }
  }
  const stateGitignore = path.join(fullBase, 'state', '.gitignore');
  try {
    fs.writeFileSync(stateGitignore, 'active-session.md\narchive/\n', { mode: 0o600, flag: 'wx' });
  } catch {}
  for (const ignoredDir of ['memory', 'knowledge']) {
    const gitignore = path.join(fullBase, ignoredDir, '.gitignore');
    try {
      fs.writeFileSync(gitignore, '*\n!.gitignore\n', { mode: 0o600, flag: 'wx' });
    } catch {}
  }
}

export { DEFAULT_STATE_DIR, validateContainment, runWithStateDirContext, resolveStateDirPath, resolveActiveSessionPath, hasActiveSession, readState, writeState, ensureWorkspace };
