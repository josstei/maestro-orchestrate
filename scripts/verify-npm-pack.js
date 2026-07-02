#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  REQUIRED_PACKAGE_FILES,
  isDeniedPath,
} = require('./release-artifact-manifest');
const { RUNTIME_SOURCE_PATHS, releasePaths } = require('./lib/artifact-inventory');

const INVENTORY_RELEASE_PATHS = releasePaths();

function pickInventoryPaths(...paths) {
  for (const inventoryPath of paths) {
    if (!INVENTORY_RELEASE_PATHS.includes(inventoryPath)) {
      throw new Error(
        `Package surface rule references a path missing from the artifact inventory: ${inventoryPath}`
      );
    }
  }

  return Object.freeze(paths);
}

const ROOT = path.resolve(__dirname, '..');

const PACKAGE_BUDGETS = Object.freeze({
  maxEntryCount: 360,
  maxPackedSize: 325000,
  maxUnpackedSize: 1200000,
});

const PRIVATE_SCRIPT_ROLES = Object.freeze({
  'scripts/check-layer-boundaries.js': {
    role: 'dev-only',
    note: 'Local and CI layer-boundary gate; private to source checkouts.',
  },
  'scripts/generate.js': {
    role: 'release-only',
    note: 'Prepack generation entrypoint; private to source checkouts and release workflows.',
  },
  'scripts/install-git-hooks.js': {
    role: 'dev-only',
    note: 'Source checkout setup helper; private to source checkouts.',
  },
  'scripts/npm-publish-idempotent.js': {
    role: 'release-only',
    note: 'Release workflow support; private to source checkouts.',
  },
  'scripts/package-release-artifacts.js': {
    role: 'release-only',
    note: 'Release artifact packaging support; private to source checkouts.',
  },
  'scripts/release-artifact-manifest.js': {
    role: 'release-only',
    note: 'Release and package artifact contract shared by source-checkout verifiers.',
  },
  'scripts/release-version-metadata.js': {
    role: 'release-only',
    note: 'Release version metadata support; private to source checkouts.',
  },
  'scripts/update-versions.js': {
    role: 'release-only',
    note: 'Version stamping support; private to source checkouts.',
  },
  'scripts/verify-npm-pack.js': {
    role: 'release-only',
    note: 'Package inventory verification support; private to source checkouts.',
  },
  'scripts/verify-release-artifacts.js': {
    role: 'release-only',
    note: 'Release artifact verification support; private to source checkouts.',
  },
});

function buildRuntimeSourcePackageRule() {
  const exact = [];
  const prefixes = [];

  for (const runtimeSourcePath of RUNTIME_SOURCE_PATHS) {
    if (path.posix.extname(runtimeSourcePath)) {
      exact.push(runtimeSourcePath);
    } else {
      prefixes.push(`${runtimeSourcePath}/`);
    }
  }

  return Object.freeze({
    id: 'runtime-source',
    exact: Object.freeze(exact),
    prefixes: Object.freeze(prefixes),
  });
}

const PACKAGE_SURFACE_RULES = Object.freeze([
  {
    id: 'package-metadata',
    exact: pickInventoryPaths(
      'package.json',
      'README.md',
      'CHANGELOG.md',
      'LICENSE',
      'EXAMPLES.md'
    ),
  },
  {
    id: 'runtime-docs',
    exact: pickInventoryPaths(
      'GEMINI.md',
      'QWEN.md',
      'docs/architecture.md',
      'docs/cicd.md',
      'docs/flow.md',
      'docs/maestro-cheatsheet.md',
      'docs/overview.md',
      'docs/runtime-claude.md',
      'docs/runtime-codex.md',
      'docs/runtime-gemini.md',
      'docs/runtime-qwen.md',
      'docs/usage.md'
    ),
  },
  {
    id: 'public-bin',
    exact: pickInventoryPaths(
      'bin/maestro-install-codex.js',
      'bin/maestro-mcp-server.js'
    ),
  },
  {
    id: 'root-runtime-metadata',
    exact: pickInventoryPaths(
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      '.claude-plugin/plugin.json',
      'gemini-extension.json',
      'qwen-extension.json'
    ),
  },
  {
    id: 'root-generated-runtime',
    prefixes: ['agents/', 'commands/', 'hooks/', 'mcp/', 'policies/'],
  },
  {
    id: 'claude-runtime',
    exact: [
      'claude/.mcp.json',
      'claude/README.md',
      'claude/hooks/claude-hooks.json',
      'claude/mcp-config.example.json',
      'claude/mcp/maestro-server.js',
    ],
    prefixes: [
      'claude/agents/',
      'claude/scripts/',
      'claude/skills/',
    ],
  },
  {
    id: 'codex-runtime',
    exact: [
      'plugins/maestro/.app.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'plugins/maestro/README.md',
    ],
    prefixes: [
      'plugins/maestro/references/',
      'plugins/maestro/skills/',
    ],
  },
  {
    id: 'qwen-runtime',
    exact: ['qwen/hooks.json'],
    prefixes: ['qwen/agents/'],
  },
  buildRuntimeSourcePackageRule(),
]);

function parsePackJson(stdout) {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`npm pack did not emit JSON output:\n${stdout}`);
  }

  return JSON.parse(stdout.slice(start, end + 1));
}

function runNpmPackDryRun(root = ROOT) {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-npm-pack-cache-'));

  try {
    const stdout = execFileSync('npm', ['pack', '--dry-run', '--json', '--cache', cacheDir], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parsePackJson(stdout);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

function matchesPackageSurfaceRule(entry, rule) {
  const exact = rule.exact || [];
  if (exact.includes(entry)) {
    return true;
  }

  const prefixes = rule.prefixes || [];
  return prefixes.some((prefix) => entry.startsWith(prefix));
}

function classifyPackageEntry(entry) {
  return PACKAGE_SURFACE_RULES.filter((rule) => matchesPackageSurfaceRule(entry, rule))
    .map((rule) => rule.id);
}

function assertPositivePackageInventory(entries) {
  const unclassified = entries.filter((entry) => classifyPackageEntry(entry).length === 0);
  if (unclassified.length > 0) {
    throw new Error(`npm package contains unclassified paths: ${unclassified.join(', ')}`);
  }
}

function assertNoPackagedRootScripts(entries) {
  const packagedScripts = entries.filter((entry) => entry.startsWith('scripts/'));
  if (packagedScripts.length > 0) {
    throw new Error(`npm package contains private root scripts: ${packagedScripts.join(', ')}`);
  }
}

function assertPackageBudgets(packageInfo, entries) {
  const failures = [];
  if (entries.length > PACKAGE_BUDGETS.maxEntryCount) {
    failures.push(`entryCount ${entries.length} > ${PACKAGE_BUDGETS.maxEntryCount}`);
  }

  if (!Number.isFinite(packageInfo.size)) {
    failures.push('packedSize metadata missing');
  } else if (packageInfo.size > PACKAGE_BUDGETS.maxPackedSize) {
    failures.push(`packedSize ${packageInfo.size} > ${PACKAGE_BUDGETS.maxPackedSize}`);
  }

  if (!Number.isFinite(packageInfo.unpackedSize)) {
    failures.push('unpackedSize metadata missing');
  } else if (packageInfo.unpackedSize > PACKAGE_BUDGETS.maxUnpackedSize) {
    failures.push(`unpackedSize ${packageInfo.unpackedSize} > ${PACKAGE_BUDGETS.maxUnpackedSize}`);
  }

  if (failures.length > 0) {
    throw new Error(`npm package exceeds budgets: ${failures.join(', ')}`);
  }
}

function verifyPackageEntries(packages) {
  if (!Array.isArray(packages) || packages.length !== 1) {
    throw new Error('Expected npm pack to report exactly one package');
  }

  const packageInfo = packages[0];
  const entries = packageInfo.files.map((file) => file.path);

  for (const requiredPath of REQUIRED_PACKAGE_FILES) {
    if (!entries.includes(requiredPath)) {
      throw new Error(`npm package missing required file: ${requiredPath}`);
    }
  }

  assertNoPackagedRootScripts(entries);

  for (const entry of entries) {
    if (isDeniedPath(entry)) {
      throw new Error(`npm package contains forbidden path: ${entry}`);
    }
  }

  assertPositivePackageInventory(entries);
  assertPackageBudgets(packageInfo, entries);

  return {
    entryCount: entries.length,
    filename: packageInfo.filename,
    packedSize: packageInfo.size,
    unpackedSize: packageInfo.unpackedSize,
  };
}

function verifyNpmPack(root = ROOT) {
  return verifyPackageEntries(runNpmPackDryRun(root));
}

if (require.main === module) {
  try {
    const result = verifyNpmPack();
    console.log(
      `Verified npm pack contents: ${result.filename} ` +
      `(${result.entryCount} files, ${result.packedSize} packed bytes, ` +
      `${result.unpackedSize} unpacked bytes)`
    );
  } catch (error) {
    console.error(`npm pack verification failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  PACKAGE_BUDGETS,
  PACKAGE_SURFACE_RULES,
  PRIVATE_SCRIPT_ROLES,
  assertPackageBudgets,
  assertPositivePackageInventory,
  assertNoPackagedRootScripts,
  classifyPackageEntry,
  parsePackJson,
  runNpmPackDryRun,
  verifyNpmPack,
  verifyPackageEntries,
};
