'use strict';

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createSettingResolver, resolveSetting } = require('../../src/config/setting-resolver');
const { withEnv } = require('../support/env');
const { makeTempDir, writeTree } = require('../support/fs');

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
    fs.rmSync(path.join(projectDir, '.env'), { force: true });
    fs.rmSync(path.join(extensionDir, '.env'), { force: true });
  }

  // Resolves MY_VAR for projectDir with MY_VAR, MAESTRO_EXTENSION_PATH and
  // CLAUDE_PLUGIN_ROOT overridden; an omitted one is unset for the call.
  const resolveWith = ({ value = null, extensionPath = null, pluginRoot = null } = {}) =>
    withEnv(
      { MY_VAR: value, MAESTRO_EXTENSION_PATH: extensionPath, CLAUDE_PLUGIN_ROOT: pluginRoot },
      () => resolveSetting('MY_VAR', projectDir)
    );

  afterEach(clearEnvFiles);

  it('returns process.env value when set', () => {
    const result = resolveWith({ value: 'from-env' });
    assert.equal(result, 'from-env');
  });

  it('returns project .env value when env var is not set', () => {
    writeProjectEnv('MY_VAR=from-project\n');
    const result = resolveWith();
    assert.equal(result, 'from-project');
  });

  it('returns extension .env value when env var and project .env are not set', () => {
    writeExtensionEnv('MY_VAR=from-extension\n');
    const result = resolveWith({ extensionPath: extensionDir });
    assert.equal(result, 'from-extension');
  });

  it('returns undefined when setting is nowhere', () => {
    const result = resolveWith();
    assert.equal(result, undefined);
  });

  it('process.env takes precedence over project .env', () => {
    writeProjectEnv('MY_VAR=from-project\n');
    const result = resolveWith({ value: 'from-env' });
    assert.equal(result, 'from-env');
  });

  it('project .env takes precedence over extension .env', () => {
    writeProjectEnv('MY_VAR=from-project\n');
    writeExtensionEnv('MY_VAR=from-extension\n');
    const result = resolveWith({ extensionPath: extensionDir });
    assert.equal(result, 'from-project');
  });

  it('ignores empty string values in env vars', () => {
    writeProjectEnv('MY_VAR=from-project\n');
    const result = resolveWith({ value: '' });
    assert.equal(result, 'from-project');
  });

  it('uses CLAUDE_PLUGIN_ROOT as fallback when MAESTRO_EXTENSION_PATH is absent', () => {
    writeExtensionEnv('MY_VAR=via-plugin-root\n');
    const result = resolveWith({ pluginRoot: extensionDir });
    assert.equal(result, 'via-plugin-root');
  });
});

describe('request-scoped setting resolver', () => {
  const withoutSettings = {
    MY_VAR: null,
    OTHER_VAR: null,
    MAESTRO_EXTENSION_PATH: null,
    CLAUDE_PLUGIN_ROOT: null,
  };

  it('reads reached files once, skips lower sources, and observes live environment values', (t) => {
    const root = makeTempDir('settings-request-');
    const project = path.join(root, 'project');
    const extension = path.join(root, 'extension');
    const projectFile = writeTree(project, '.env', 'MY_VAR=workspace\n');
    const extensionFile = writeTree(extension, '.env', 'OTHER_VAR=extension\n');
    const read = t.mock.method(fs, 'readFileSync');
    const reads = () => read.mock.calls.map(({ arguments: args }) => args[0]);

    withEnv({ ...withoutSettings, MY_VAR: 'environment', MAESTRO_EXTENSION_PATH: extension }, () => {
      const resolve = createSettingResolver(project);
      assert.deepEqual(reads(), []);
      assert.equal(resolve('MY_VAR'), 'environment');
      assert.deepEqual(reads(), []);
      process.env.MY_VAR = '';
      assert.equal(resolve('MY_VAR'), 'workspace');
      assert.equal(resolve('MY_VAR'), 'workspace');
      assert.deepEqual(reads(), [projectFile]);
      assert.equal(resolve('OTHER_VAR'), 'extension');
      assert.equal(resolve('OTHER_VAR'), 'extension');
      assert.deepEqual(reads(), [projectFile, extensionFile]);
      process.env.MY_VAR = 'updated environment';
      assert.equal(resolve('MY_VAR'), 'updated environment');
      assert.deepEqual(reads(), [projectFile, extensionFile]);
    });
  });

  it('snapshots files only within the resolver while scalar calls remain fresh', () => {
    const project = makeTempDir('settings-snapshot-');
    const file = writeTree(project, '.env', 'MY_VAR=before\n');
    withEnv(withoutSettings, () => {
      const resolve = createSettingResolver(project);
      assert.equal(resolve('MY_VAR'), 'before');
      fs.writeFileSync(file, 'MY_VAR=after\n');
      assert.equal(resolve('MY_VAR'), 'before');
      assert.equal(createSettingResolver(project)('MY_VAR'), 'after');
      assert.equal(resolveSetting('MY_VAR', project), 'after');
      fs.writeFileSync(file, 'MY_VAR=latest\n');
      assert.equal(resolveSetting('MY_VAR', project), 'latest');
    });
  });

  it('uses the current extension override and falls back to the current Claude plugin root', () => {
    const root = makeTempDir('settings-extension-');
    const first = path.join(root, 'first');
    const second = path.join(root, 'second');
    writeTree(first, '.env', 'MY_VAR=first\n');
    writeTree(second, '.env', 'MY_VAR=second\n');
    withEnv({ ...withoutSettings, MAESTRO_EXTENSION_PATH: first, CLAUDE_PLUGIN_ROOT: second }, () => {
      const resolve = createSettingResolver(null);
      assert.equal(resolve('MY_VAR'), 'first');
      process.env.MAESTRO_EXTENSION_PATH = second;
      assert.equal(resolve('MY_VAR'), 'second');
      delete process.env.MAESTRO_EXTENSION_PATH;
      assert.equal(resolve('MY_VAR'), 'second');
    });
  });

  it('caches missing and unreadable sources within a request without making them fatal', (t) => {
    const project = makeTempDir('settings-missing-');
    const extension = makeTempDir('settings-unreadable-');
    const projectFile = path.join(project, '.env');
    const extensionFile = path.join(extension, '.env');
    const originalRead = fs.readFileSync;
    const read = t.mock.method(fs, 'readFileSync', (file, ...args) => {
      if (file === extensionFile) throw Object.assign(new Error('denied'), { code: 'EACCES' });
      return originalRead(file, ...args);
    });
    withEnv({ ...withoutSettings, MAESTRO_EXTENSION_PATH: extension }, () => {
      const resolve = createSettingResolver(project);
      assert.equal(resolve('MY_VAR'), undefined);
      assert.equal(resolve('OTHER_VAR'), undefined);
      assert.deepEqual(read.mock.calls.map(({ arguments: args }) => args[0]), [projectFile, extensionFile]);
      fs.writeFileSync(projectFile, 'MY_VAR=created\n');
      assert.equal(resolve('MY_VAR'), undefined);
      assert.equal(createSettingResolver(project)('MY_VAR'), 'created');
    });
  });

  it('replays warning text, ordering and multiplicity for every reached source', (t) => {
    const project = makeTempDir('settings-warn-project-');
    const extension = makeTempDir('settings-warn-extension-');
    writeTree(project, '.env', 'WORKSPACE="unfinished\n');
    writeTree(extension, '.env', 'EXTENSION="unfinished\n');
    t.mock.method(console, 'warn', () => {});
    const read = t.mock.method(fs, 'readFileSync');
    withEnv({ ...withoutSettings, MAESTRO_EXTENSION_PATH: extension }, () => {
      const resolve = createSettingResolver(project);
      for (const name of ['MY_VAR', 'OTHER_VAR', 'MY_VAR']) assert.equal(resolve(name), undefined);
      assert.equal(read.mock.calls.length, 2);
      const warning = (key) => `env-file-parser: unclosed quote for key "${key}", treating accumulated content as value`;
      assert.deepEqual(console.warn.mock.calls.map(({ arguments: args }) => args[0]), [
        warning('WORKSPACE'), warning('EXTENSION'),
        warning('WORKSPACE'), warning('EXTENSION'),
        warning('WORKSPACE'), warning('EXTENSION'),
      ]);
    });
  });

  it('reads a shared workspace/extension path once but warns for both logical sources', (t) => {
    const project = makeTempDir('settings-shared-path-');
    writeTree(project, '.env', 'UNFINISHED="value\n');
    t.mock.method(console, 'warn', () => {});
    const read = t.mock.method(fs, 'readFileSync');
    withEnv({ ...withoutSettings, MAESTRO_EXTENSION_PATH: project }, () => {
      const resolve = createSettingResolver(project);
      assert.equal(resolve('MY_VAR'), undefined);
      assert.equal(resolve('MY_VAR'), undefined);
      assert.equal(read.mock.calls.length, 1);
      assert.deepEqual(console.warn.mock.calls.map(({ arguments: args }) => args[0]), Array(4).fill(
        'env-file-parser: unclosed quote for key "UNFINISHED", treating accumulated content as value'
      ));
    });
  });

  it('can scope warning delivery without changing shared-source diagnostic counts', (t) => {
    const project = makeTempDir('settings-captured-warnings-');
    writeTree(project, '.env', 'UNFINISHED="value\n');
    const fallback = t.mock.method(console, 'warn', () => {});
    const warnings = [];
    withEnv({ ...withoutSettings, MAESTRO_EXTENSION_PATH: project }, () => {
      const resolve = createSettingResolver(project, { onWarning: (message) => warnings.push(message) });
      assert.equal(resolve('MY_VAR'), undefined);
      assert.equal(resolve('MY_VAR'), undefined);
      assert.equal(fallback.mock.calls.length, 0);
      assert.deepEqual(warnings, Array(4).fill(
        'env-file-parser: unclosed quote for key "UNFINISHED", treating accumulated content as value'
      ));
    });
  });
});
