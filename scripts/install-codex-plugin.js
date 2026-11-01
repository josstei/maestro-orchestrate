#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { formatJson } = require('../src/lib/io');
const { codexMarketplace, codexMarketplacePlugin } = require('../src/platforms/metadata');
const { runCli } = require('./lib/cli');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PLUGIN_DIR = path.join(ROOT, 'plugins', 'maestro');
const TARGET_PLUGIN_DIR = path.join(os.homedir(), '.codex', 'plugins', 'maestro');
const MARKETPLACE_FILE = path.join(os.homedir(), '.agents', 'plugins', 'marketplace.json');
const PLUGIN_SOURCE_PATH = './.codex/plugins/maestro';

const USAGE = `Install Maestro into Codex's personal plugin marketplace.

Usage:
  node scripts/install-codex-plugin.js [--dry-run]

Options:
  --dry-run   Show planned changes without writing files
  --help      Show this help text
`;

function readMarketplace(defaults) {
  if (!fs.existsSync(MARKETPLACE_FILE)) {
    return null;
  }

  const raw = fs.readFileSync(MARKETPLACE_FILE, 'utf8');
  let marketplace;
  try {
    marketplace = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse ${MARKETPLACE_FILE}: ${error.message}`);
  }

  if (!marketplace || typeof marketplace !== 'object' || Array.isArray(marketplace)) {
    throw new Error(`Expected ${MARKETPLACE_FILE} to contain a JSON object`);
  }

  if (!Array.isArray(marketplace.plugins)) {
    throw new Error(`Expected ${MARKETPLACE_FILE} to contain a plugins array`);
  }

  if (!marketplace.name) {
    marketplace.name = defaults.name;
  }

  if (!marketplace.interface || typeof marketplace.interface !== 'object') {
    marketplace.interface = defaults.interface;
  } else if (!marketplace.interface.displayName) {
    marketplace.interface.displayName = defaults.interface.displayName;
  }

  return marketplace;
}

function main({ dryRun }) {
  const manifestPath = path.join(SOURCE_PLUGIN_DIR, '.codex-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Source plugin manifest not found: ${manifestPath}`);
  }

  const defaults = codexMarketplace([]);
  const existing = readMarketplace(defaults);
  const marketplace = existing || defaults;
  const index = marketplace.plugins.findIndex((plugin) => plugin && plugin.name === 'maestro');
  marketplace.plugins[index >= 0 ? index : marketplace.plugins.length] = codexMarketplacePlugin(PLUGIN_SOURCE_PATH);

  if (!dryRun) {
    fs.mkdirSync(path.dirname(TARGET_PLUGIN_DIR), { recursive: true });
    fs.rmSync(TARGET_PLUGIN_DIR, { recursive: true, force: true });
    fs.cpSync(SOURCE_PLUGIN_DIR, TARGET_PLUGIN_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(MARKETPLACE_FILE), { recursive: true });
    fs.writeFileSync(MARKETPLACE_FILE, formatJson(marketplace));
  }

  console.log(`${dryRun ? 'Dry run complete.' : 'Maestro installed for Codex.'}
Plugin source: ${SOURCE_PLUGIN_DIR}
Plugin target: ${TARGET_PLUGIN_DIR}
Marketplace: ${MARKETPLACE_FILE} (${existing ? 'updated' : 'created'}, plugin ${index >= 0 ? 'updated' : 'added'})

Next steps:
1. Start Codex or restart it if already open.
2. Run \`/plugins\`.
3. Search for \`Maestro\` and select \`Install plugin\`.`);
}

runCli(module, { failure: 'codex plugin install failed', booleans: { '--dry-run': 'dryRun' }, usage: USAGE }, main);
