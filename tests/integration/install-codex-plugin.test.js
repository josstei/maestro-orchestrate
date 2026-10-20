'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { describe, it } = require('node:test');
const { makeTempDir, readJson, writeJson } = require('../support/fs');
const { ROOT } = require('./helpers');

function runInstaller(homeDir, args) {
  return spawnSync(process.execPath, ['scripts/install-codex-plugin.js', ...args], {
    cwd: ROOT,
    env: { ...process.env, HOME: homeDir },
    encoding: 'utf8',
  });
}

// Runs the installer, fails the test unless it exits 0, and returns its stdout.
function runInstallerOk(homeDir, args = []) {
  const result = runInstaller(homeDir, args);
  assert.equal(result.status, 0, `installer failed: ${result.stderr}`);
  return result.stdout;
}

describe('codex installer integration', () => {
  it('installs the plugin into the personal Codex marketplace', () => {
    const homeDir = makeTempDir('maestro-codex-home-');

    const output = runInstallerOk(homeDir);
    const pluginManifest = path.join(homeDir, '.codex', 'plugins', 'maestro', '.codex-plugin', 'plugin.json');
    const pluginSrcEntry = path.join(
      homeDir,
      '.codex',
      'plugins',
      'maestro',
      'src',
      'mcp',
      'maestro-server.js'
    );
    const marketplaceFile = path.join(homeDir, '.agents', 'plugins', 'marketplace.json');

    assert.ok(fs.existsSync(pluginManifest), 'Expected installer to copy the Codex plugin bundle');
    assert.ok(
      fs.existsSync(pluginSrcEntry),
      'Expected installer to copy the detached Codex src payload'
    );
    assert.ok(fs.existsSync(marketplaceFile), 'Expected installer to create the personal marketplace file');

    const marketplace = readJson(marketplaceFile);
    const plugin = marketplace.plugins.find((entry) => entry.name === 'maestro');

    assert.equal(marketplace.name, 'maestro-orchestrator');
    assert.equal(marketplace.interface.displayName, 'Maestro Orchestrator');
    assert.deepEqual(plugin, {
      name: 'maestro',
      source: { source: 'local', path: './.codex/plugins/maestro' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Coding',
    });
    assert.match(output, /Maestro installed for Codex\./);
    assert.match(output, /Run `\/plugins`\./);
  });

  it('preserves other personal marketplace plugins while upserting maestro', () => {
    const homeDir = makeTempDir('maestro-codex-home-');
    const marketplaceFile = path.join(homeDir, '.agents', 'plugins', 'marketplace.json');

    writeJson(marketplaceFile, {
      name: 'personal-plugins',
      interface: { displayName: 'Personal Plugins' },
      plugins: [
        {
          name: 'existing-plugin',
          source: { source: 'local', path: './.codex/plugins/existing-plugin' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity',
        },
        {
          name: 'maestro',
          source: { source: 'local', path: './plugins/old-maestro' },
          policy: { installation: 'NOT_AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Coding',
        },
      ],
    });

    runInstallerOk(homeDir);

    const marketplace = readJson(marketplaceFile);

    assert.equal(marketplace.name, 'personal-plugins');
    assert.equal(marketplace.interface.displayName, 'Personal Plugins');
    assert.equal(marketplace.plugins.length, 2);
    assert.ok(marketplace.plugins.some((entry) => entry.name === 'existing-plugin'));
    assert.deepEqual(
      marketplace.plugins.find((entry) => entry.name === 'maestro'),
      {
        name: 'maestro',
        source: { source: 'local', path: './.codex/plugins/maestro' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Coding',
      }
    );
  });

  it('supports a dry run without writing files', () => {
    const homeDir = makeTempDir('maestro-codex-home-');

    const output = runInstallerOk(homeDir, ['--dry-run']);

    assert.match(output, /Dry run complete\./);
    assert.equal(fs.existsSync(path.join(homeDir, '.codex')), false);
    assert.equal(fs.existsSync(path.join(homeDir, '.agents')), false);
  });

  it('reports unknown arguments as a one-line failure without writing files', () => {
    const homeDir = makeTempDir('maestro-codex-home-');

    const result = runInstaller(homeDir, ['--foo']);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'codex plugin install failed: Unknown argument: --foo\n');
    assert.deepEqual(fs.readdirSync(homeDir), []);
  });
});
