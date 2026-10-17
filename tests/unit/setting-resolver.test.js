'use strict';

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveSetting } = require('../../src/config/setting-resolver');
const { withEnv } = require('../support/env');
const { makeTempDir } = require('../support/fs');

describe('resolveSetting', () => {
  let projectDir;
  let extensionDir;

  before(() => {
    const tmpDir = makeTempDir('setting-resolver-');
    projectDir = path.join(tmpDir, 'project');
    extensionDir = path.join(tmpDir, 'extension');
    fs.mkdirSync(projectDir);
    fs.mkdirSync(extensionDir);
  });

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

  afterEach(clearEnvFiles);

  it('returns process.env value when set', () => {
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
  });

  it('returns extension .env value when env var and project .env are not set', () => {
    writeExtensionEnv('MY_VAR=from-extension\n');
    const result = withEnv(
      { MY_VAR: null, MAESTRO_EXTENSION_PATH: extensionDir, CLAUDE_PLUGIN_ROOT: null },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, 'from-extension');
  });

  it('returns undefined when setting is nowhere', () => {
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
  });

  it('project .env takes precedence over extension .env', () => {
    writeProjectEnv('MY_VAR=from-project\n');
    writeExtensionEnv('MY_VAR=from-extension\n');
    const result = withEnv(
      { MY_VAR: null, MAESTRO_EXTENSION_PATH: extensionDir, CLAUDE_PLUGIN_ROOT: null },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, 'from-project');
  });

  it('ignores empty string values in env vars', () => {
    writeProjectEnv('MY_VAR=from-project\n');
    const result = withEnv(
      { MY_VAR: '', MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: null },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, 'from-project');
  });

  it('uses CLAUDE_PLUGIN_ROOT as fallback when MAESTRO_EXTENSION_PATH is absent', () => {
    writeExtensionEnv('MY_VAR=via-plugin-root\n');
    const result = withEnv(
      { MY_VAR: null, MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: extensionDir },
      () => resolveSetting('MY_VAR', projectDir)
    );
    assert.equal(result, 'via-plugin-root');
  });
});
