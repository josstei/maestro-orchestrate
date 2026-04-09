const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { describe, it } = require('node:test');
const { ROOT } = require('./helpers');

function runInstaller(homeDir, args = []) {
  return execFileSync('node', ['scripts/install-codex-plugin.js', ...args], {
    cwd: ROOT,
    env: { ...process.env, HOME: homeDir },
    encoding: 'utf8',
  });
}

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-codex-home-'));
}

describe('codex installer integration', () => {
  it('installs the plugin into the personal Codex marketplace', () => {
    const homeDir = makeTempHome();

    try {
      const output = runInstaller(homeDir);
      const pluginManifest = path.join(homeDir, '.codex', 'plugins', 'maestro', '.codex-plugin', 'plugin.json');
      const marketplaceFile = path.join(homeDir, '.agents', 'plugins', 'marketplace.json');

      assert.ok(fs.existsSync(pluginManifest), 'Expected installer to copy the Codex plugin bundle');
      assert.ok(fs.existsSync(marketplaceFile), 'Expected installer to create the personal marketplace file');

      const marketplace = JSON.parse(fs.readFileSync(marketplaceFile, 'utf8'));
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
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('preserves other personal marketplace plugins while upserting maestro', () => {
    const homeDir = makeTempHome();
    const marketplaceFile = path.join(homeDir, '.agents', 'plugins', 'marketplace.json');

    try {
      fs.mkdirSync(path.dirname(marketplaceFile), { recursive: true });
      fs.writeFileSync(marketplaceFile, `${JSON.stringify({
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
      }, null, 2)}\n`);

      runInstaller(homeDir);

      const marketplace = JSON.parse(fs.readFileSync(marketplaceFile, 'utf8'));

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
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('supports a dry run without writing files', () => {
    const homeDir = makeTempHome();

    try {
      const output = runInstaller(homeDir, ['--dry-run']);

      assert.match(output, /Dry run complete\./);
      assert.equal(fs.existsSync(path.join(homeDir, '.codex')), false);
      assert.equal(fs.existsSync(path.join(homeDir, '.agents')), false);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
