'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const state = require('../../src/lib/state');

describe('resolveActiveSessionPath()', () => {
  it('uses default .gemini when MAESTRO_STATE_DIR is unset', () => {
    const orig = process.env.MAESTRO_STATE_DIR;
    delete process.env.MAESTRO_STATE_DIR;
    try {
      const result = state.resolveActiveSessionPath('/project');
      assert.equal(result, path.join('/project', '.gemini', 'state', 'active-session.md'));
    } finally {
      if (orig !== undefined) process.env.MAESTRO_STATE_DIR = orig;
    }
  });

  it('uses MAESTRO_STATE_DIR when set to relative path', () => {
    const orig = process.env.MAESTRO_STATE_DIR;
    process.env.MAESTRO_STATE_DIR = '.maestro';
    try {
      const result = state.resolveActiveSessionPath('/project');
      assert.equal(result, path.join('/project', '.maestro', 'state', 'active-session.md'));
    } finally {
      if (orig !== undefined) process.env.MAESTRO_STATE_DIR = orig;
      else delete process.env.MAESTRO_STATE_DIR;
    }
  });

  it('uses MAESTRO_STATE_DIR when set to absolute path', () => {
    const orig = process.env.MAESTRO_STATE_DIR;
    process.env.MAESTRO_STATE_DIR = '/abs/path';
    try {
      const result = state.resolveActiveSessionPath('/project');
      assert.equal(result, path.join('/abs/path', 'state', 'active-session.md'));
    } finally {
      if (orig !== undefined) process.env.MAESTRO_STATE_DIR = orig;
      else delete process.env.MAESTRO_STATE_DIR;
    }
  });

  it('uses cwd when cwd is empty and state dir is relative', () => {
    const orig = process.env.MAESTRO_STATE_DIR;
    delete process.env.MAESTRO_STATE_DIR;
    try {
      const result = state.resolveActiveSessionPath('');
      assert.ok(result.endsWith(path.join('.gemini', 'state', 'active-session.md')));
    } finally {
      if (orig !== undefined) process.env.MAESTRO_STATE_DIR = orig;
    }
  });
});

describe('hasActiveSession()', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-state-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); delete process.env.MAESTRO_STATE_DIR; });

  it('returns true when active-session.md exists', () => {
    const stateDir = path.join(tmpDir, '.gemini', 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'active-session.md'), 'test');
    assert.equal(state.hasActiveSession(tmpDir), true);
  });

  it('returns false when file does not exist', () => {
    assert.equal(state.hasActiveSession(tmpDir), false);
  });
});

describe('readState()', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-readstate-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('reads file content at relative path', () => {
    fs.mkdirSync(path.join(tmpDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'sub', 'file.md'), 'hello');
    const content = state.readState('sub/file.md', tmpDir);
    assert.equal(content, 'hello');
  });

  it('throws for absolute path', () => {
    assert.throws(() => state.readState('/etc/passwd', tmpDir), /relative/i);
  });

  it('throws for path traversal', () => {
    assert.throws(() => state.readState('../escape/file', tmpDir), /traversal/i);
  });

  it('throws for missing file', () => {
    assert.throws(() => state.readState('nonexistent.md', tmpDir));
  });
});

describe('writeState()', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-writestate-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('writes content atomically', () => {
    state.writeState('output.md', 'content', tmpDir);
    const result = fs.readFileSync(path.join(tmpDir, 'output.md'), 'utf8');
    assert.equal(result, 'content');
  });

  it('creates parent directories', () => {
    state.writeState('deep/nested/file.md', 'data', tmpDir);
    const result = fs.readFileSync(path.join(tmpDir, 'deep', 'nested', 'file.md'), 'utf8');
    assert.equal(result, 'data');
  });

  it('throws for absolute path', () => {
    assert.throws(() => state.writeState('/abs/path', 'data', tmpDir), /relative/i);
  });

  it('throws for path traversal', () => {
    assert.throws(() => state.writeState('../escape', 'data', tmpDir), /traversal/i);
  });
});

describe('ensureWorkspace()', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-workspace-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('creates all required directories', () => {
    state.ensureWorkspace('.gemini', tmpDir);
    const base = path.join(tmpDir, '.gemini');
    assert.ok(fs.existsSync(path.join(base, 'state')));
    assert.ok(fs.existsSync(path.join(base, 'state', 'archive')));
    assert.ok(fs.existsSync(path.join(base, 'plans')));
    assert.ok(fs.existsSync(path.join(base, 'plans', 'archive')));
    assert.ok(fs.existsSync(path.join(base, 'parallel')));
  });

  it('throws for absolute path', () => {
    assert.throws(() => state.ensureWorkspace('/abs', tmpDir), /relative/i);
  });

  it('throws for path traversal', () => {
    assert.throws(() => state.ensureWorkspace('..', tmpDir), /traversal/i);
  });
});
