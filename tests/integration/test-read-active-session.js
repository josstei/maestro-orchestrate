'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  scriptPath,
  runScript,
  runScriptWithExit,
  createTempDir,
  writeSessionState,
  removeTempDir,
  setFakeHome,
} = require('./helpers');

const SCRIPT_FILE = scriptPath('read-active-session.js');

describe('read-active-session script', () => {
  it('returns No active session when state file is absent', () => {
    const tempDir = createTempDir('maestro-test-ras-missing-');
    try {
      const stdout = runScript(SCRIPT_FILE, [], { cwd: tempDir });
      assert.ok(stdout.includes('No active session'));
    } finally {
      removeTempDir(tempDir);
    }
  });

  it('reads active session from default .gemini state directory', () => {
    const tempDir = createTempDir('maestro-test-ras-default-');
    try {
      writeSessionState(tempDir, 'default marker');
      const stdout = runScript(SCRIPT_FILE, [], { cwd: tempDir });
      assert.ok(stdout.includes('default marker'));
    } finally {
      removeTempDir(tempDir);
    }
  });

  it('honors MAESTRO_STATE_DIR relative path override', () => {
    const tempDir = createTempDir('maestro-test-ras-relative-');
    try {
      writeSessionState(tempDir, 'relative marker', '.maestro');
      const stdout = runScript(SCRIPT_FILE, [], {
        cwd: tempDir,
        env: { MAESTRO_STATE_DIR: '.maestro' },
      });
      assert.ok(stdout.includes('relative marker'));
    } finally {
      removeTempDir(tempDir);
    }
  });

  it('honors MAESTRO_STATE_DIR absolute path override', () => {
    const projectDir = createTempDir('maestro-test-ras-proj-');
    const absStateDir = createTempDir('maestro-test-ras-abs-');
    try {
      writeSessionState(absStateDir, 'absolute marker', '');
      const stdout = runScript(SCRIPT_FILE, [], {
        cwd: projectDir,
        env: { MAESTRO_STATE_DIR: absStateDir },
      });
      assert.ok(stdout.includes('absolute marker'));
    } finally {
      removeTempDir(projectDir);
      removeTempDir(absStateDir);
    }
  });

  it('uses workspace .env when MAESTRO_STATE_DIR is unset', () => {
    const tempDir = createTempDir('maestro-test-ras-wsenv-');
    try {
      fs.writeFileSync(path.join(tempDir, '.env'), 'MAESTRO_STATE_DIR=.custom-state\n');
      writeSessionState(tempDir, 'env marker', '.custom-state');

      const env = { ...process.env };
      delete env.MAESTRO_STATE_DIR;
      delete env.MAESTRO_EXTENSION_PATH;

      const stdout = runScript(SCRIPT_FILE, [], { cwd: tempDir, env });
      assert.ok(stdout.includes('env marker'));
    } finally {
      removeTempDir(tempDir);
    }
  });

  it('uses extension .env fallback when workspace .env is absent', () => {
    const projectDir = createTempDir('maestro-test-ras-extenv-proj-');
    const fakeHome = createTempDir('maestro-test-ras-extenv-home-');
    try {
      const extEnvDir = path.join(fakeHome, '.gemini', 'extensions', 'maestro');
      fs.mkdirSync(extEnvDir, { recursive: true });
      fs.writeFileSync(path.join(extEnvDir, '.env'), 'MAESTRO_STATE_DIR=.ext-state\n');
      writeSessionState(projectDir, 'extension env marker', '.ext-state');

      const env = { ...process.env };
      setFakeHome(env, fakeHome);
      delete env.MAESTRO_STATE_DIR;
      delete env.MAESTRO_EXTENSION_PATH;

      const stdout = runScript(SCRIPT_FILE, [], { cwd: projectDir, env });
      assert.ok(stdout.includes('extension env marker'));
    } finally {
      removeTempDir(projectDir);
      removeTempDir(fakeHome);
    }
  });

  it('honors MAESTRO_EXTENSION_PATH for extension .env fallback', () => {
    const projectDir = createTempDir('maestro-test-ras-extpath-proj-');
    const fakeExtDir = createTempDir('maestro-test-ras-extpath-ext-');
    try {
      fs.writeFileSync(path.join(fakeExtDir, '.env'), 'MAESTRO_STATE_DIR=.ext-path-state\n');
      writeSessionState(projectDir, 'extension path marker', '.ext-path-state');

      const env = { ...process.env, MAESTRO_EXTENSION_PATH: fakeExtDir };
      delete env.MAESTRO_STATE_DIR;

      const stdout = runScript(SCRIPT_FILE, [], { cwd: projectDir, env });
      assert.ok(stdout.includes('extension path marker'));
    } finally {
      removeTempDir(projectDir);
      removeTempDir(fakeExtDir);
    }
  });

  it('returns No active session when MAESTRO_STATE_DIR is invalid', () => {
    const tempDir = createTempDir('maestro-test-ras-invalid-state-dir-');
    try {
      const { stdout, exitCode } = runScriptWithExit(SCRIPT_FILE, [], {
        cwd: tempDir,
        env: { MAESTRO_STATE_DIR: '../bad' },
      });
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('No active session'));
    } finally {
      removeTempDir(tempDir);
    }
  });
});
