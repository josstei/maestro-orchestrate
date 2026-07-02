'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveSetting } = require('../../src/config/setting-resolver');
const { makeTempSrcRoot, cleanupTempRoots } = require('../support/content');

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
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('resolveSetting', () => {
  let tmpDir;
  let projectDir;
  let extensionDir;

  before(() => {
    tmpDir = makeTempSrcRoot('setting-resolver-');
    projectDir = path.join(tmpDir, 'project');
    extensionDir = path.join(tmpDir, 'extension');
    fs.mkdirSync(projectDir);
    fs.mkdirSync(extensionDir);
  });

  after(cleanupTempRoots);

  function writeProjectEnv(content) {
    fs.writeFileSync(path.join(projectDir, '.env'), content, 'utf8');
  }

  function writeExtensionEnv(content) {
    fs.writeFileSync(path.join(extensionDir, '.env'), content, 'utf8');
  }

  function clearEnvFiles() {
    const projectEnvPath = path.join(projectDir, '.env');
    const extensionEnvPath = path.join(extensionDir, '.env');
    if (fs.existsSync(projectEnvPath)) fs.unlinkSync(projectEnvPath);
    if (fs.existsSync(extensionEnvPath)) fs.unlinkSync(extensionEnvPath);
  }

  it('returns process.env value when set', () => {
    clearEnvFiles();
    const result = withEnv(
      { MY_VAR: 'from-env', MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: null },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, 'from-env');
  });

  it('returns project .env value when env var is not set', () => {
    writeProjectEnv('MY_VAR=from-project\n');
    const result = withEnv(
      { MY_VAR: null, MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: null },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, 'from-project');
    clearEnvFiles();
  });

  it('returns extension .env value when env var and project .env are not set', () => {
    writeExtensionEnv('MY_VAR=from-extension\n');
    const result = withEnv(
      { MY_VAR: null, MAESTRO_EXTENSION_PATH: extensionDir, CLAUDE_PLUGIN_ROOT: null },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, 'from-extension');
    clearEnvFiles();
  });

  it('returns undefined when setting is nowhere', () => {
    clearEnvFiles();
    const result = withEnv(
      { MY_VAR: null, MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: null },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, undefined);
  });

  it('process.env takes precedence over project .env', () => {
    writeProjectEnv('MY_VAR=from-project\n');
    const result = withEnv(
      { MY_VAR: 'from-env', MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: null },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, 'from-env');
    clearEnvFiles();
  });

  it('project .env takes precedence over extension .env', () => {
    writeProjectEnv('MY_VAR=from-project\n');
    writeExtensionEnv('MY_VAR=from-extension\n');
    const result = withEnv(
      { MY_VAR: null, MAESTRO_EXTENSION_PATH: extensionDir, CLAUDE_PLUGIN_ROOT: null },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, 'from-project');
    clearEnvFiles();
  });

  it('ignores empty string values in env vars', () => {
    writeProjectEnv('MY_VAR=from-project\n');
    const result = withEnv(
      { MY_VAR: '', MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: null },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, 'from-project');
    clearEnvFiles();
  });

  it('uses MAESTRO_EXTENSION_PATH for extension root', () => {
    writeExtensionEnv('MY_VAR=via-maestro-path\n');
    const result = withEnv(
      { MY_VAR: null, MAESTRO_EXTENSION_PATH: extensionDir, CLAUDE_PLUGIN_ROOT: null },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, 'via-maestro-path');
    clearEnvFiles();
  });

  it('ignores CLAUDE_PLUGIN_ROOT when MAESTRO_EXTENSION_PATH is absent', () => {
    writeExtensionEnv('MY_VAR=via-plugin-root\n');
    const result = withEnv(
      { MY_VAR: null, MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: extensionDir },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, undefined);
    clearEnvFiles();
  });
});
