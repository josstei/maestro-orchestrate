#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PLUGIN_DIR = path.join(ROOT, 'plugins', 'maestro');
const TARGET_PLUGIN_DIR = path.join(os.homedir(), '.codex', 'plugins', 'maestro');
const MARKETPLACE_FILE = path.join(os.homedir(), '.agents', 'plugins', 'marketplace.json');

const DEFAULT_MARKETPLACE = {
  name: 'maestro-orchestrator',
  interface: {
    displayName: 'Maestro Orchestrator',
  },
  plugins: [],
};

const PLUGIN_ENTRY = {
  name: 'maestro',
  source: {
    source: 'local',
    path: './.codex/plugins/maestro',
  },
  policy: {
    installation: 'AVAILABLE',
    authentication: 'ON_INSTALL',
  },
  category: 'Coding',
};

function printHelp() {
  console.log(`Install Maestro into Codex's personal plugin marketplace.

Usage:
  node scripts/install-codex-plugin.js [--dry-run]

Options:
  --dry-run   Show planned changes without writing files
  --help      Show this help text
`);
}

function parseArgs(argv) {
  const args = new Set(argv);

  if (args.has('--help') || args.has('-h')) {
    printHelp();
    process.exit(0);
  }

  for (const arg of args) {
    if (!['--dry-run', '--help', '-h'].includes(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    dryRun: args.has('--dry-run'),
  };
}

function assertSourcePlugin() {
  const manifestPath = path.join(SOURCE_PLUGIN_DIR, '.codex-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Source plugin manifest not found: ${manifestPath}`);
  }
}

function readMarketplace() {
  if (!fs.existsSync(MARKETPLACE_FILE)) {
    return {
      marketplace: JSON.parse(JSON.stringify(DEFAULT_MARKETPLACE)),
      existed: false,
    };
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
    marketplace.name = DEFAULT_MARKETPLACE.name;
  }

  if (!marketplace.interface || typeof marketplace.interface !== 'object') {
    marketplace.interface = { ...DEFAULT_MARKETPLACE.interface };
  } else if (!marketplace.interface.displayName) {
    marketplace.interface.displayName = DEFAULT_MARKETPLACE.interface.displayName;
  }

  return {
    marketplace,
    existed: true,
  };
}

function upsertPluginEntry(marketplace) {
  const nextEntry = JSON.parse(JSON.stringify(PLUGIN_ENTRY));
  const existingIndex = marketplace.plugins.findIndex((plugin) => plugin && plugin.name === 'maestro');

  if (existingIndex >= 0) {
    marketplace.plugins[existingIndex] = nextEntry;
  } else {
    marketplace.plugins.push(nextEntry);
  }

  return existingIndex >= 0 ? 'updated' : 'added';
}

function writeMarketplace(marketplace) {
  fs.mkdirSync(path.dirname(MARKETPLACE_FILE), { recursive: true });
  fs.writeFileSync(MARKETPLACE_FILE, `${JSON.stringify(marketplace, null, 2)}\n`);
}

function installPluginCopy() {
  fs.mkdirSync(path.dirname(TARGET_PLUGIN_DIR), { recursive: true });
  fs.rmSync(TARGET_PLUGIN_DIR, { recursive: true, force: true });
  fs.cpSync(SOURCE_PLUGIN_DIR, TARGET_PLUGIN_DIR, { recursive: true });
}

function printSummary({ dryRun, marketplaceExisted, pluginAction }) {
  const mode = dryRun ? 'Dry run complete.' : 'Maestro installed for Codex.';
  const marketplaceStatus = marketplaceExisted ? 'updated' : 'created';

  console.log(mode);
  console.log(`Plugin source: ${SOURCE_PLUGIN_DIR}`);
  console.log(`Plugin target: ${TARGET_PLUGIN_DIR}`);
  console.log(`Marketplace: ${MARKETPLACE_FILE} (${marketplaceStatus}, plugin ${pluginAction})`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Start Codex or restart it if already open.');
  console.log('2. Run `/plugins`.');
  console.log('3. Search for `Maestro` and select `Install plugin`.');
}

function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  assertSourcePlugin();

  const { marketplace, existed: marketplaceExisted } = readMarketplace();
  const pluginAction = upsertPluginEntry(marketplace);

  if (!dryRun) {
    installPluginCopy();
    writeMarketplace(marketplace);
  }

  printSummary({ dryRun, marketplaceExisted, pluginAction });
}

main();
