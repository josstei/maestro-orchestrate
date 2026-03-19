'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('../core/atomic-write');

const DEFAULT_STATE_DIR = 'docs/maestro';

function validateRelativePath(filePath) {
  if (path.isAbsolute(filePath)) {
    throw new Error(`Path must be relative (got: ${filePath})`);
  }
  const segments = filePath.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new Error(`Path traversal not allowed (got: ${filePath})`);
  }
}

function resolveStateDirPath(cwd, stateDirOverride) {
  const stateDir = stateDirOverride || process.env.MAESTRO_STATE_DIR || DEFAULT_STATE_DIR;

  if (path.isAbsolute(stateDir)) {
    return stateDir;
  }

  validateRelativePath(stateDir);
  const base = cwd || process.cwd();
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
  const fullBase = path.isAbsolute(stateDir) ? stateDir : (() => {
    validateRelativePath(stateDir);
    return path.join(basePath, stateDir);
  })();
  try {
    const stats = fs.lstatSync(fullBase);
    if (stats.isSymbolicLink()) {
      throw new Error(`STATE_DIR must not be a symlink (got: ${stateDir})`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const dirs = [
    path.join(fullBase, 'state'),
    path.join(fullBase, 'state', 'archive'),
    path.join(fullBase, 'plans'),
    path.join(fullBase, 'plans', 'archive'),
  ];
  for (const dir of dirs) {
    const relativeDir = path.relative(basePath, dir) || dir;
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      throw new Error(`Failed to create directory: ${relativeDir}`);
    }
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new Error(`Directory not writable: ${relativeDir}`);
    }
  }
}

module.exports = {
  DEFAULT_STATE_DIR,
  resolveStateDirPath,
  resolveActiveSessionPath,
  hasActiveSession,
  readState,
  writeState,
  ensureWorkspace,
};
