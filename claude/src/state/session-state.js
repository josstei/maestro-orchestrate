'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteSync } = require('../lib/io');
const { ValidationError, ConfigError } = require('../lib/errors');

const DEFAULT_STATE_DIR = 'docs/maestro';

function validateRelativePath(filePath) {
  if (path.isAbsolute(filePath)) {
    throw new ValidationError('Path must be relative', {
      code: 'PATH_NOT_RELATIVE',
      details: { value: filePath },
    });
  }
  const segments = filePath.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new ValidationError('Path traversal not allowed', {
      code: 'PATH_TRAVERSAL',
      details: { value: filePath },
    });
  }
}

function validateContainment(absolutePath, rootDir) {
  let resolved = path.resolve(absolutePath);
  let resolvedRoot = path.resolve(rootDir);
  try { resolved = fs.realpathSync(resolved); } catch {}
  try { resolvedRoot = fs.realpathSync(resolvedRoot); } catch {}
  const rootPrefix = resolvedRoot + path.sep;
  if (!resolved.startsWith(rootPrefix) && resolved !== resolvedRoot) {
    throw new ValidationError('state_dir must be within the project root', {
      code: 'PATH_ESCAPES_ROOT',
      details: { path: resolved, base: resolvedRoot },
    });
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
    throw new ConfigError('STATE_DIR must not be a symlink', {
      code: 'STATE_DIR_IS_SYMLINK',
      details: { state_dir: fullBase },
    });
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
    } catch (err) {
      throw new ConfigError('Failed to create workspace directory', {
        code: 'STATE_DIR_NOT_CREATABLE',
        details: { dir, cause: err.message },
      });
    }
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch (err) {
      throw new ConfigError('Workspace directory not writable', {
        code: 'STATE_DIR_NOT_WRITABLE',
        details: { dir, cause: err.message },
      });
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
