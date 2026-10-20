'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_STATE_DIR,
  resolveStateDirPath,
  resolveActiveSessionPath,
  readState,
  writeState,
  ensureWorkspace,
} = require('../../src/state/session-state');
const { withEnv } = require('../support/env');
const { makeTempDir } = require('../support/fs');

describe('session-state', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = makeTempDir('maestro-test-');
  });

  it('DEFAULT_STATE_DIR equals docs/maestro', () => {
    assert.equal(DEFAULT_STATE_DIR, 'docs/maestro');
  });

  it('resolveStateDirPath returns the resolved path of an absolute state dir within root', () => {
    const subDir = path.join(tmpRoot, 'sub');
    fs.mkdirSync(subDir);
    const result = resolveStateDirPath(tmpRoot, subDir);
    assert.equal(result, fs.realpathSync(subDir));
  });

  it('resolveStateDirPath rejects absolute state dirs that traverse out of root', () => {
    const traversalPath = path.join(tmpRoot, '..', 'outside');
    assert.throws(
      () => resolveStateDirPath(tmpRoot, traversalPath),
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
    const result = withEnv({ MAESTRO_STATE_DIR: null, MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: null }, () =>
      resolveStateDirPath(tmpRoot, undefined)
    );
    assert.equal(result, path.join(tmpRoot, DEFAULT_STATE_DIR));
  });

  it('resolveStateDirPath reads MAESTRO_STATE_DIR from the workspace .env when the env var is unset', () => {
    // initialize_workspace already honors the workspace .env; session tools and
    // hooks must resolve the same directory.
    fs.writeFileSync(path.join(tmpRoot, '.env'), 'MAESTRO_STATE_DIR=.maestro\n');
    const result = withEnv({ MAESTRO_STATE_DIR: null }, () =>
      resolveStateDirPath(tmpRoot, undefined)
    );
    assert.equal(result, path.join(tmpRoot, '.maestro'));
  });

  it('resolveStateDirPath prefers the MAESTRO_STATE_DIR env var over the workspace .env', () => {
    fs.writeFileSync(path.join(tmpRoot, '.env'), 'MAESTRO_STATE_DIR=.maestro\n');
    const result = withEnv({ MAESTRO_STATE_DIR: 'env/state' }, () =>
      resolveStateDirPath(tmpRoot, undefined)
    );
    assert.equal(result, path.join(tmpRoot, 'env/state'));
  });

  it('resolveActiveSessionPath finds the session under the state dir named in the workspace .env', () => {
    fs.writeFileSync(path.join(tmpRoot, '.env'), 'MAESTRO_STATE_DIR=.maestro\n');
    const result = withEnv({ MAESTRO_STATE_DIR: null }, () => resolveActiveSessionPath(tmpRoot));
    assert.equal(result, path.join(tmpRoot, '.maestro', 'state', 'active-session.md'));
  });

  it('resolveStateDirPath rejects absolute paths outside root via validateContainment', () => {
    const outsideDir = makeTempDir('maestro-abs-outside-');
    assert.throws(
      () => resolveStateDirPath(tmpRoot, outsideDir),
      /state_dir must be within the project root/
    );
  });

  it('resolveActiveSessionPath returns correct path', () => {
    const result = withEnv({ MAESTRO_STATE_DIR: null }, () => resolveActiveSessionPath(tmpRoot));
    assert.equal(result, path.join(tmpRoot, DEFAULT_STATE_DIR, 'state', 'active-session.md'));
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
