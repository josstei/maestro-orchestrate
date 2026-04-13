'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { validateSessionId } = require('../../src/state/session-id-validator');
const {
  DEFAULT_STATE_DIR,
  validateContainment,
  resolveStateDirPath,
  resolveActiveSessionPath,
  hasActiveSession,
  readState,
  writeState,
  ensureWorkspace,
} = require('../../src/state/session-state');

function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('validateSessionId', () => {
  it('returns true for alphanumeric strings', () => {
    assert.equal(validateSessionId('abc123'), true);
    assert.equal(validateSessionId('ABC'), true);
    assert.equal(validateSessionId('123'), true);
  });

  it('returns true for strings with hyphens and underscores', () => {
    assert.equal(validateSessionId('session-id_01'), true);
    assert.equal(validateSessionId('a-b_c'), true);
  });

  it('returns false for null', () => {
    assert.equal(validateSessionId(null), false);
  });

  it('returns false for undefined', () => {
    assert.equal(validateSessionId(undefined), false);
  });

  it('returns false for non-string values', () => {
    assert.equal(validateSessionId(42), false);
    assert.equal(validateSessionId({}), false);
  });

  it('returns false for empty string', () => {
    assert.equal(validateSessionId(''), false);
  });

  it('returns false for strings with spaces', () => {
    assert.equal(validateSessionId('session id'), false);
    assert.equal(validateSessionId(' '), false);
  });

  it('returns false for strings with special characters', () => {
    assert.equal(validateSessionId('id!'), false);
    assert.equal(validateSessionId('id@name'), false);
    assert.equal(validateSessionId('id#1'), false);
    assert.equal(validateSessionId('path/id'), false);
    assert.equal(validateSessionId('id..next'), false);
  });

  it('returns false for path traversal attempts', () => {
    assert.equal(validateSessionId('../etc'), false);
  });
});

describe('session-state', () => {
  let tmpRoot;
  let savedStateDirEnv;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-'));
    savedStateDirEnv = process.env.MAESTRO_STATE_DIR;
  });

  afterEach(() => {
    if (savedStateDirEnv == null) {
      delete process.env.MAESTRO_STATE_DIR;
    } else {
      process.env.MAESTRO_STATE_DIR = savedStateDirEnv;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('DEFAULT_STATE_DIR equals docs/maestro', () => {
    assert.equal(DEFAULT_STATE_DIR, 'docs/maestro');
  });

  it('validateContainment returns resolved path when within root', () => {
    const subDir = path.join(tmpRoot, 'sub');
    fs.mkdirSync(subDir);
    const result = validateContainment(subDir, tmpRoot);
    assert.equal(result, fs.realpathSync(subDir));
  });

  it('validateContainment throws when path is outside root', () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-outside-'));
    try {
      assert.throws(
        () => validateContainment(outsideDir, tmpRoot),
        /state_dir must be within the project root/
      );
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('validateContainment throws for path traversal', () => {
    const traversalPath = path.join(tmpRoot, '..', 'outside');
    assert.throws(
      () => validateContainment(traversalPath, tmpRoot),
      /state_dir must be within the project root/
    );
  });

  it('resolveStateDirPath uses override when provided', () => {
    const result = resolveStateDirPath(tmpRoot, 'custom/state');
    assert.equal(result, path.join(tmpRoot, 'custom/state'));
  });

  it('resolveStateDirPath uses MAESTRO_STATE_DIR env when no override', () => {
    const result = withEnv({ MAESTRO_STATE_DIR: 'env/state' }, () =>
      resolveStateDirPath(tmpRoot, undefined)
    );
    assert.equal(result, path.join(tmpRoot, 'env/state'));
  });

  it('resolveStateDirPath uses DEFAULT_STATE_DIR as final fallback', () => {
    const result = withEnv({ MAESTRO_STATE_DIR: null }, () =>
      resolveStateDirPath(tmpRoot, undefined)
    );
    assert.equal(result, path.join(tmpRoot, DEFAULT_STATE_DIR));
  });

  it('resolveStateDirPath rejects absolute paths outside root via validateContainment', () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-abs-outside-'));
    try {
      assert.throws(
        () => resolveStateDirPath(tmpRoot, outsideDir),
        /state_dir must be within the project root/
      );
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('resolveActiveSessionPath returns correct path', () => {
    const result = resolveActiveSessionPath(tmpRoot);
    assert.equal(result, path.join(tmpRoot, DEFAULT_STATE_DIR, 'state', 'active-session.md'));
  });

  it('hasActiveSession returns false when no session file exists', () => {
    assert.equal(hasActiveSession(tmpRoot), false);
  });

  it('hasActiveSession returns true when session file exists', () => {
    const sessionPath = resolveActiveSessionPath(tmpRoot);
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, '---\nphase: planning\n---\n');
    assert.equal(hasActiveSession(tmpRoot), true);
  });

  it('readState reads file content from basePath', () => {
    const content = 'session content';
    const filePath = path.join(tmpRoot, 'state.md');
    fs.writeFileSync(filePath, content);
    const result = readState('state.md', tmpRoot);
    assert.equal(result, content);
  });

  it('readState throws for absolute paths', () => {
    assert.throws(
      () => readState('/etc/passwd', tmpRoot),
      /Path must be relative/
    );
  });

  it('readState throws for paths with ..', () => {
    assert.throws(
      () => readState('foo/../bar', tmpRoot),
      /Path traversal not allowed/
    );
  });

  it('writeState writes content to basePath atomically', () => {
    const content = 'written content';
    writeState('output.md', content, tmpRoot);
    const written = fs.readFileSync(path.join(tmpRoot, 'output.md'), 'utf8');
    assert.equal(written, content);
  });

  it('writeState throws for absolute paths', () => {
    assert.throws(
      () => writeState('/etc/passwd', 'content', tmpRoot),
      /Path must be relative/
    );
  });

  it('writeState throws for paths with ..', () => {
    assert.throws(
      () => writeState('foo/../bar', 'content', tmpRoot),
      /Path traversal not allowed/
    );
  });

  it('ensureWorkspace creates required directories', () => {
    ensureWorkspace('workspace', tmpRoot);
    const base = path.join(tmpRoot, 'workspace');
    assert.ok(fs.statSync(path.join(base, 'state')).isDirectory());
    assert.ok(fs.statSync(path.join(base, 'state', 'archive')).isDirectory());
    assert.ok(fs.statSync(path.join(base, 'plans')).isDirectory());
    assert.ok(fs.statSync(path.join(base, 'plans', 'archive')).isDirectory());
  });

  it('ensureWorkspace is idempotent', () => {
    ensureWorkspace('workspace', tmpRoot);
    assert.doesNotThrow(() => ensureWorkspace('workspace', tmpRoot));
  });

  it('ensureWorkspace creates .gitignore in state/ dir', () => {
    ensureWorkspace('workspace', tmpRoot);
    const gitignorePath = path.join(tmpRoot, 'workspace', 'state', '.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf8');
    assert.equal(content, 'active-session.md\narchive/\n');
  });
});
