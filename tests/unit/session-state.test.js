import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { withEnvSync } from '../support/environment.js';
import { makeTempDir } from '../support/filesystem.js';

import {
  DEFAULT_STATE_DIR,
  validateContainment,
  resolveStateDirPath,
  resolveActiveSessionPath,
  hasActiveSession,
  readState,
  writeState,
  ensureWorkspace,
} from '../../dist/src/state/session-state.js';

describe('session-state', () => {
  let tmpRoot;

  beforeEach((t) => {
    tmpRoot = makeTempDir(t, 'maestro-test-');
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

  it('validateContainment throws when path is outside root', (t) => {
    const outsideDir = makeTempDir(t, 'maestro-outside-');
    assert.throws(
      () => validateContainment(outsideDir, tmpRoot),
      /state_dir must be within the project root/
    );
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
    const result = withEnvSync({ MAESTRO_STATE_DIR: 'env/state' }, () =>
      resolveStateDirPath(tmpRoot, undefined)
    );
    assert.equal(result, path.join(tmpRoot, 'env/state'));
  });

  it('resolveStateDirPath uses DEFAULT_STATE_DIR as final fallback', () => {
    const result = withEnvSync({ MAESTRO_STATE_DIR: null }, () =>
      resolveStateDirPath(tmpRoot, undefined)
    );
    assert.equal(result, path.join(tmpRoot, DEFAULT_STATE_DIR));
  });

  it('resolveStateDirPath rejects absolute paths outside root via validateContainment', (t) => {
    const outsideDir = makeTempDir(t, 'maestro-abs-outside-');
    assert.throws(
      () => resolveStateDirPath(tmpRoot, outsideDir),
      /state_dir must be within the project root/
    );
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

  it('ensureWorkspace creates memory and knowledge directories', () => {
    ensureWorkspace('workspace', tmpRoot);
    const base = path.join(tmpRoot, 'workspace');
    assert.ok(fs.statSync(path.join(base, 'memory')).isDirectory());
    assert.ok(fs.statSync(path.join(base, 'knowledge')).isDirectory());
  });

  it('ensureWorkspace writes a gitignore covering memory and knowledge contents', () => {
    ensureWorkspace('workspace', tmpRoot);
    const base = path.join(tmpRoot, 'workspace');
    assert.equal(
      fs.readFileSync(path.join(base, 'memory', '.gitignore'), 'utf8'),
      '*\n!.gitignore\n'
    );
    assert.equal(
      fs.readFileSync(path.join(base, 'knowledge', '.gitignore'), 'utf8'),
      '*\n!.gitignore\n'
    );
  });
});
