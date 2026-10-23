'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { handleResolveSettings } = require('../../src/mcp/handlers/resolve-settings');
const { MAESTRO_SETTINGS } = require('../../src/config/settings-catalog');
const { withEnv } = require('../support/env');
const { makeTempDir, writeTree } = require('../support/fs');

const SETTING_NAMES = MAESTRO_SETTINGS.map(({ envVar }) => envVar);
const CLEAN_ENV = Object.fromEntries([
  ...SETTING_NAMES, 'MAESTRO_EXTENSION_PATH', 'CLAUDE_PLUGIN_ROOT',
].map((name) => [name, null]));

describe('handleResolveSettings', () => {
  it('reads each source once per call and refreshes files on the next call', (t) => {
    const project = makeTempDir('resolve-settings-project-');
    const extension = makeTempDir('resolve-settings-extension-');
    const projectFile = writeTree(project, '.env', 'MAESTRO_DISABLED_AGENTS=architect, tester, \n');
    const extensionFile = writeTree(extension, '.env', 'MAESTRO_MAX_RETRIES=4\n');
    const read = t.mock.method(fs, 'readFileSync');

    withEnv({ ...CLEAN_ENV, MAESTRO_EXTENSION_PATH: extension }, () => {
      const first = handleResolveSettings({}, project);
      assert.deepEqual(Object.keys(first.settings), SETTING_NAMES);
      assert.equal(first.settings.MAESTRO_MAX_RETRIES, '4');
      assert.equal(first.settings.MAESTRO_VALIDATION_STRICTNESS, null);
      assert.deepEqual(first.disabled_agents, ['architect', 'tester']);
      assert.deepEqual(read.mock.calls.map(({ arguments: args }) => args[0]), [projectFile, extensionFile]);

      fs.writeFileSync(projectFile, 'MAESTRO_DISABLED_AGENTS=coder\nMAESTRO_MAX_RETRIES=\n');
      fs.writeFileSync(extensionFile, 'MAESTRO_MAX_RETRIES=5\n');
      assert.deepEqual(handleResolveSettings({ settings: ['MAESTRO_MAX_RETRIES', 'MAESTRO_DISABLED_AGENTS'] }, project), {
        settings: { MAESTRO_MAX_RETRIES: '5', MAESTRO_DISABLED_AGENTS: 'coder' },
        disabled_agents: ['coder'],
      });
      assert.deepEqual(read.mock.calls.map(({ arguments: args }) => args[0]), [
        projectFile, extensionFile, projectFile, extensionFile,
      ]);
    });
  });

  it('does not read files for unknown names or settings satisfied by the environment', (t) => {
    const project = makeTempDir('resolve-settings-skipped-');
    const read = t.mock.method(fs, 'readFileSync');
    withEnv({ ...CLEAN_ENV, MAESTRO_MAX_RETRIES: '2' }, () => {
      assert.deepEqual(handleResolveSettings({ settings: ['UNKNOWN'] }, project), {
        settings: {}, disabled_agents: [],
      });
      assert.deepEqual(handleResolveSettings({ settings: ['UNKNOWN', 'MAESTRO_MAX_RETRIES'] }, project), {
        settings: { MAESTRO_MAX_RETRIES: '2' }, disabled_agents: [],
      });
      assert.equal(read.mock.calls.length, 0);
    });
  });

  it('keeps duplicate-request diagnostics when both sources share one file', (t) => {
    const project = makeTempDir('resolve-settings-warnings-');
    writeTree(project, '.env', 'BROKEN="unfinished\n');
    const read = t.mock.method(fs, 'readFileSync');
    t.mock.method(console, 'warn', () => {});
    withEnv({ ...CLEAN_ENV, MAESTRO_EXTENSION_PATH: project }, () => {
      assert.deepEqual(handleResolveSettings({
        settings: ['MAESTRO_MAX_RETRIES', 'UNKNOWN', 'MAESTRO_MAX_RETRIES'],
      }, project), { settings: { MAESTRO_MAX_RETRIES: null }, disabled_agents: [] });
      assert.equal(read.mock.calls.length, 1);
      assert.deepEqual(console.warn.mock.calls.map(({ arguments: args }) => args[0]), Array(4).fill(
        'env-file-parser: unclosed quote for key "BROKEN", treating accumulated content as value'
      ));
    });
  });
});
