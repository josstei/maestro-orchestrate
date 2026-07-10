#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';
import { moduleDirname } from '../core/module-path.js';
import { resolvePackageRoot } from '../core/package-root.js';

type MarketplacePlugin = {
  name?: string;
  [key: string]: unknown;
};

type Marketplace = {
  name?: string;
  interface?: {
    displayName?: string;
    [key: string]: unknown;
  };
  plugins: MarketplacePlugin[];
  [key: string]: unknown;
};

const ROOT = resolvePackageRoot(moduleDirname(import.meta.url), { malformedJson: 'throw' });
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
  maestro-install-codex [--dry-run]

Options:
  --dry-run   Show planned changes without writing files
  --help      Show this help text
`);
}

function parseArgs(argv: string[]): { dryRun: boolean } {
  const knownArgs = new Set(['--dry-run', '--help', '-h']);

  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const unknownArg = argv.find((arg) => !knownArgs.has(arg));
  if (unknownArg) {
    throw new Error(`Unknown argument: ${unknownArg}`);
  }

  const { values } = parseNodeArgs({
    args: argv,
    allowPositionals: false,
    options: {
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });

  return {
    dryRun: values['dry-run'] ?? false,
  };
}

function assertSourcePlugin(): void {
  const manifestPath = path.join(SOURCE_PLUGIN_DIR, '.codex-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Source plugin manifest not found: ${manifestPath}`);
  }
}

function readMarketplace(): { marketplace: Marketplace; existed: boolean } {
  if (!fs.existsSync(MARKETPLACE_FILE)) {
    return {
      marketplace: JSON.parse(JSON.stringify(DEFAULT_MARKETPLACE)),
      existed: false,
    };
  }

  const raw = fs.readFileSync(MARKETPLACE_FILE, 'utf8');
  let marketplace: unknown;
  try {
    marketplace = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${MARKETPLACE_FILE}: ${message}`);
  }

  if (!marketplace || typeof marketplace !== 'object' || Array.isArray(marketplace)) {
    throw new Error(`Expected ${MARKETPLACE_FILE} to contain a JSON object`);
  }

  const typedMarketplace = marketplace as Marketplace;

  if (!Array.isArray(typedMarketplace.plugins)) {
    throw new Error(`Expected ${MARKETPLACE_FILE} to contain a plugins array`);
  }

  if (!typedMarketplace.name) {
    typedMarketplace.name = DEFAULT_MARKETPLACE.name;
  }

  if (!typedMarketplace.interface || typeof typedMarketplace.interface !== 'object') {
    typedMarketplace.interface = { ...DEFAULT_MARKETPLACE.interface };
  } else if (!typedMarketplace.interface.displayName) {
    typedMarketplace.interface.displayName = DEFAULT_MARKETPLACE.interface.displayName;
  }

  return {
    marketplace: typedMarketplace,
    existed: true,
  };
}

function upsertPluginEntry(marketplace: Marketplace): 'updated' | 'added' {
  const nextEntry = JSON.parse(JSON.stringify(PLUGIN_ENTRY));
  const existingIndex = marketplace.plugins.findIndex((plugin) => plugin && plugin.name === 'maestro');

  if (existingIndex >= 0) {
    marketplace.plugins[existingIndex] = nextEntry;
  } else {
    marketplace.plugins.push(nextEntry);
  }

  return existingIndex >= 0 ? 'updated' : 'added';
}

function writeMarketplace(marketplace: Marketplace): void {
  fs.mkdirSync(path.dirname(MARKETPLACE_FILE), { recursive: true });
  fs.writeFileSync(MARKETPLACE_FILE, `${JSON.stringify(marketplace, null, 2)}\n`);
}

function installPluginCopy(): void {
  fs.mkdirSync(path.dirname(TARGET_PLUGIN_DIR), { recursive: true });
  fs.rmSync(TARGET_PLUGIN_DIR, { recursive: true, force: true });
  fs.cpSync(SOURCE_PLUGIN_DIR, TARGET_PLUGIN_DIR, { recursive: true });
}

function printSummary({
  dryRun,
  marketplaceExisted,
  pluginAction,
}: {
  dryRun: boolean;
  marketplaceExisted: boolean;
  pluginAction: 'updated' | 'added';
}): void {
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

function main(): void {
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
