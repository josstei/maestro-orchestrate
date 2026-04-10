'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('../core/atomic-write');

const DEFAULT_STATE_DIR = 'docs/maestro';

function validateRelativePath(filePath) {
  if (path.isAbsolute(filePath)) {
    throw new Error('Path must be relative');
  }
  const segments = filePath.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
}

function validateContainment(absolutePath, rootDir) {
  let resolved = path.resolve(absolutePath);
  let resolvedRoot = path.resolve(rootDir);
  try { resolved = fs.realpathSync(resolved); } catch {}
  try { resolvedRoot = fs.realpathSync(resolvedRoot); } catch {}
  const rootPrefix = resolvedRoot + path.sep;
  if (!resolved.startsWith(rootPrefix) && resolved !== resolvedRoot) {
    throw new Error('state_dir must be within the project root');
  }
  return resolved;
}

function resolveStateDirPath(cwd, stateDirOverride) {
  const stateDir = stateDirOverride || process.env.MAESTRO_STATE_DIR || DEFAULT_STATE_DIR;
  const base = cwd || process.cwd();

  if (path.isAbsolute(stateDir)) {
    return validateContainment(stateDir, base);
  }

  validateRelativePath(stateDir);
  return path.join(base, stateDir);
}

function resolveActiveSessionPath(cwd) {
  return path.join(resolveStateDirPath(cwd), 'state', 'active-session.md');
}

function hasActiveSession(cwd) {
  try {
    const sessionPath = resolveActiveSessionPath(cwd);
    return fs.existsSync(sessionPath);
  } catch {
    return false;
  }
}

function readState(relativePath, basePath) {
  validateRelativePath(relativePath);
  const fullPath = path.join(basePath, relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

function writeState(relativePath, content, basePath) {
  validateRelativePath(relativePath);
  const fullPath = path.join(basePath, relativePath);
  atomicWriteSync(fullPath, content);
}

function ensureWorkspace(stateDir, basePath) {
  const fullBase = path.isAbsolute(stateDir)
    ? validateContainment(stateDir, basePath)
    : (() => {
        validateRelativePath(stateDir);
        return path.join(basePath, stateDir);
      })();
  fs.mkdirSync(fullBase, { recursive: true, mode: 0o700 });
  const stats = fs.lstatSync(fullBase);
  if (stats.isSymbolicLink()) {
    throw new Error('STATE_DIR must not be a symlink');
  }
  const dirs = [
    path.join(fullBase, 'state'),
    path.join(fullBase, 'state', 'archive'),
    path.join(fullBase, 'plans'),
    path.join(fullBase, 'plans', 'archive'),
  ];
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {
      throw new Error('Failed to create workspace directory');
    }
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
}

module.exports = {
  DEFAULT_STATE_DIR,
  validateContainment,
  resolveStateDirPath,
  resolveActiveSessionPath,
  hasActiveSession,
  readState,
  writeState,
  ensureWorkspace,
};
