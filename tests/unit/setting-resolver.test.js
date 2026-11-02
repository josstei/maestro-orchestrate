'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createSettingResolver, parseEnvFile, resolveSetting } = require('../../src/config/setting-resolver');
const { withEnv } = require('../support/env');
const { makeTempDir, writeTree } = require('../support/fs');

describe('resolveSetting', () => {
  // Each case writes MY_VAR into the project and extension .env files it names,
  // sets MY_VAR and the variable that points at the extension dir (the other
  // extension variable is unset), then resolves MY_VAR for the project.
  for (const [name, projectValue, extensionValue, extensionVar, envValue, expected] of [
    ['returns process.env value when set', null, null, null, 'from-env', 'from-env'],
    ['returns project .env value when env var is not set', 'from-project', null, null, null, 'from-project'],
    ['returns extension .env value when env var and project .env are not set',
      null, 'from-extension', 'MAESTRO_EXTENSION_PATH', null, 'from-extension'],
    ['returns undefined when setting is nowhere', null, null, null, null, undefined],
    ['process.env takes precedence over project .env', 'from-project', null, null, 'from-env', 'from-env'],
    ['project .env takes precedence over extension .env',
      'from-project', 'from-extension', 'MAESTRO_EXTENSION_PATH', null, 'from-project'],
    ['ignores empty string values in env vars', 'from-project', null, null, '', 'from-project'],
    ['uses CLAUDE_PLUGIN_ROOT as fallback when MAESTRO_EXTENSION_PATH is absent',
      null, 'via-plugin-root', 'CLAUDE_PLUGIN_ROOT', null, 'via-plugin-root'],
  ]) {
    it(name, () => {
      const [project, extension] = [makeTempDir('setting-project-'), makeTempDir('setting-extension-')];
      if (projectValue) writeTree(project, '.env', `MY_VAR=${projectValue}\n`);
      if (extensionValue) writeTree(extension, '.env', `MY_VAR=${extensionValue}\n`);
      const env = { MY_VAR: envValue, MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: null };
      if (extensionVar) env[extensionVar] = extension;
      assert.equal(withEnv(env, () => resolveSetting('MY_VAR', project)), expected);
    });
  }
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
      const warning = (key) => `setting-resolver: unclosed quote for key "${key}", treating accumulated content as value`;
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
        'setting-resolver: unclosed quote for key "UNFINISHED", treating accumulated content as value'
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
        'setting-resolver: unclosed quote for key "UNFINISHED", treating accumulated content as value'
      ));
    });
  });
});

describe('parseEnvFile', () => {
  const parse = (content) => parseEnvFile(writeTree(makeTempDir('setting-resolver-env-'), '.env', content));
  for (const [title, content, values] of [
    ['parses a simple KEY=VALUE pair', 'FOO=bar\n', { FOO: 'bar' }],
    ['parses multiple KEY=VALUE pairs', 'A=1\nB=2\nC=3\n', { A: '1', B: '2', C: '3' }],
    ['ignores comment lines starting with #', '# This is a comment\nKEY=value\n', { KEY: 'value' }],
    ['strips inline comments after whitespace', 'KEY=value # this is a comment\n', { KEY: 'value' }],
    ['preserves # inside double-quoted values', 'KEY="value#not-a-comment"\n', { KEY: 'value#not-a-comment' }],
    ['preserves # inside single-quoted values', "KEY='value#not-a-comment'\n", { KEY: 'value#not-a-comment' }],
    ['trims matching double quotes from values', 'KEY="hello world"\n', { KEY: 'hello world' }],
    ['trims matching single quotes from values', "KEY='hello world'\n", { KEY: 'hello world' }],
    ['does not trim mismatched quotes', "KEY='value\"\n", { KEY: "'value\"" }],
    ['handles export prefix', 'export KEY=value\n', { KEY: 'value' }],
    ['parses multi-line double-quoted values',
      'KEY="line one\nline two\nline three"\n', { KEY: 'line one\nline two\nline three' }],
    ['handles empty file', '', {}],
    ['skips blank lines', '\n\nKEY=value\n\n', { KEY: 'value' }],
    ['skips lines without an = sign', 'NOTAVALIDLINE\nKEY=value\n', { KEY: 'value' }],
    ['handles KEY= with empty value', 'KEY=\n', { KEY: '' }],
    ['handles values with = in them using only the first = as separator', 'KEY=a=b=c\n', { KEY: 'a=b=c' }],
  ]) {
    it(title, () => assert.deepEqual(parse(content), { values, warnings: [] }));
  }

  it('returns the accumulated value and a warning for an unclosed multi-line quote without logging it', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    assert.deepEqual(parse('KEY="line one\nline two\n'), {
      values: { KEY: 'line one\nline two\n' },
      warnings: ['setting-resolver: unclosed quote for key "KEY", treating accumulated content as value'],
    });
    assert.equal(warn.mock.calls.length, 0);
  });

  it('returns no values or warnings for a non-existent file path', () => {
    const missing = path.join(makeTempDir('setting-resolver-env-'), 'does-not-exist.env');
    assert.deepEqual(parseEnvFile(missing), { values: {}, warnings: [] });
  });
});
