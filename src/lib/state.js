'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_STATE_DIR } = require('./constants');

function validateRelativePath(filePath) {
  if (path.isAbsolute(filePath)) {
    throw new Error(`Path must be relative (got: ${filePath})`);
  }
  if (filePath.includes('..')) {
    throw new Error(`Path traversal not allowed (got: ${filePath})`);
  }
}

function resolveActiveSessionPath(cwd) {
  const stateDir = process.env.MAESTRO_STATE_DIR || DEFAULT_STATE_DIR;

  if (path.isAbsolute(stateDir)) {
    return path.join(stateDir, 'state', 'active-session.md');
  }

  const base = cwd || process.cwd();
  return path.join(base, stateDir, 'state', 'active-session.md');
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
  const parentDir = path.dirname(fullPath);
  fs.mkdirSync(parentDir, { recursive: true });
  const tmpFile = fullPath + `.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpFile, content);
    fs.renameSync(tmpFile, fullPath);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch {}
    throw err;
  }
}

function ensureWorkspace(stateDir, basePath) {
  validateRelativePath(stateDir);
  const fullBase = path.join(basePath, stateDir);
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
    path.join(fullBase, 'parallel'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  resolveActiveSessionPath,
  hasActiveSession,
  readState,
  writeState,
  ensureWorkspace,
};
