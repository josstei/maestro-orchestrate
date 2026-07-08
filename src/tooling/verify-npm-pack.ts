#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REQUIRED_PACKAGE_FILES, isDeniedPath } from './release-artifact-manifest.js';
import { RUNTIME_DIST_PATHS, releasePaths } from './lib/artifact-inventory.js';
import { resolvePackageRoot, runAsMain } from './lib/cli.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const INVENTORY_RELEASE_PATHS = releasePaths();

type PackageBudget = {
  id: string;
  maxEntryCount: number;
  maxPackedSize: number;
  maxUnpackedSize: number;
};

type PackageSurfaceRule = Readonly<{
  id: string;
  exact?: readonly string[];
  prefixes?: readonly string[];
}>;

type PackageInfo = {
  filename: string;
  size: number;
  unpackedSize: number;
  files: Array<{ path: string }>;
};

type VerifyPackageOptions = {
  enforceBudgets?: boolean;
  budgets?: PackageBudget;
};

type VerifyPackageResult = {
  budget: string;
  entryCount: number;
  filename: string;
  packedSize: number;
  unpackedSize: number;
};

function pickInventoryPaths(...paths: string[]): readonly string[] {
  for (const inventoryPath of paths) {
    if (!INVENTORY_RELEASE_PATHS.includes(inventoryPath)) {
      throw new Error(
        `Package surface rule references a path missing from the artifact inventory: ${inventoryPath}`
      );
    }
  }

  return Object.freeze(paths);
}

const ROOT = resolvePackageRoot(moduleDirname);

const FINAL_PACKAGE_BUDGETS: Readonly<PackageBudget> = Object.freeze({
  id: 'final-dist-only',
  maxEntryCount: 390,
  maxPackedSize: 360000,
  maxUnpackedSize: 1280000,
});

const PACKAGE_BUDGETS = Object.freeze({
  ...FINAL_PACKAGE_BUDGETS,
  final: FINAL_PACKAGE_BUDGETS,
});

const PRIVATE_SCRIPT_ROLES = Object.freeze({
  'src/tooling/check-esm-imports.ts': {
    role: 'dev-only',
    note: 'Local and CI ESM import-specifier gate; private to source checkouts.',
  },
  'src/tooling/check-layer-boundaries.ts': {
    role: 'dev-only',
    note: 'Local and CI layer-boundary gate; private to source checkouts.',
  },
  'src/tooling/generate.ts': {
    role: 'release-only',
    note: 'Prepack generation entrypoint; private to source checkouts and release workflows.',
  },
  'src/tooling/install-git-hooks.ts': {
    role: 'dev-only',
    note: 'Source checkout setup helper; private to source checkouts.',
  },
  'src/tooling/npm-publish-idempotent.ts': {
    role: 'release-only',
    note: 'Release workflow support; private to source checkouts.',
  },
  'src/tooling/package-release-artifacts.ts': {
    role: 'release-only',
    note: 'Release artifact packaging support; private to source checkouts.',
  },
  'src/tooling/publish-dist-branch.ts': {
    role: 'release-only',
    note: 'Generated dist branch snapshot publisher; private to source checkouts and release workflows.',
  },
  'src/tooling/release-artifact-manifest.ts': {
    role: 'release-only',
    note: 'Release and package artifact contract shared by source-checkout verifiers.',
  },
  'src/tooling/release-version-metadata.ts': {
    role: 'release-only',
    note: 'Release version metadata support; private to source checkouts.',
  },
  'src/tooling/update-versions.ts': {
    role: 'release-only',
    note: 'Version stamping support; private to source checkouts.',
  },
  'src/tooling/verify-npm-pack.ts': {
    role: 'release-only',
    note: 'Package inventory verification support; private to source checkouts.',
  },
  'src/tooling/verify-release-artifacts.ts': {
    role: 'release-only',
    note: 'Release artifact verification support; private to source checkouts.',
  },
});

function buildRuntimeDistPackageRule() {
  const exact = [];
  const prefixes = [];

  for (const runtimeDistPath of RUNTIME_DIST_PATHS) {
    if (path.posix.extname(runtimeDistPath)) {
      exact.push(runtimeDistPath);
    } else {
      prefixes.push(`${runtimeDistPath}/`);
    }
  }

  return Object.freeze({
    id: 'runtime-dist',
    exact: Object.freeze(exact),
    prefixes: Object.freeze(prefixes),
  });
}

const PACKAGE_SURFACE_RULES: readonly PackageSurfaceRule[] = Object.freeze([
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
      'dist/src/bin/maestro-install-codex.js',
      'dist/src/bin/maestro-mcp-server.js'
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
  buildRuntimeDistPackageRule(),
]);

function parsePackJson(stdout: string): PackageInfo[] {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`npm pack did not emit JSON output:\n${stdout}`);
  }

  return JSON.parse(stdout.slice(start, end + 1));
}

function runNpmPackDryRun(root: string = ROOT): PackageInfo[] {
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

function matchesPackageSurfaceRule(entry: string, rule: PackageSurfaceRule): boolean {
  const exact = rule.exact || [];
  if (exact.includes(entry)) {
    return true;
  }

  const prefixes = rule.prefixes || [];
  return prefixes.some((prefix) => entry.startsWith(prefix));
}

function classifyPackageEntry(entry: string): string[] {
  return PACKAGE_SURFACE_RULES.filter((rule) => matchesPackageSurfaceRule(entry, rule))
    .map((rule) => rule.id);
}

function assertPositivePackageInventory(entries: string[]): void {
  const unclassified = entries.filter((entry) => classifyPackageEntry(entry).length === 0);
  if (unclassified.length > 0) {
    throw new Error(`npm package contains unclassified paths: ${unclassified.join(', ')}`);
  }
}

function assertNoPackagedRootScripts(entries: string[]): void {
  const packagedScripts = entries.filter((entry) => entry.startsWith('scripts/'));
  if (packagedScripts.length > 0) {
    throw new Error(`npm package contains private root scripts: ${packagedScripts.join(', ')}`);
  }
}

function assertPackageBudgets(packageInfo: PackageInfo, entries: string[], budgets: PackageBudget = PACKAGE_BUDGETS.final): void {
  const failures: string[] = [];
  if (entries.length > budgets.maxEntryCount) {
    failures.push(`entryCount ${entries.length} > ${budgets.maxEntryCount}`);
  }

  if (!Number.isFinite(packageInfo.size)) {
    failures.push('packedSize metadata missing');
  } else if (packageInfo.size > budgets.maxPackedSize) {
    failures.push(`packedSize ${packageInfo.size} > ${budgets.maxPackedSize}`);
  }

  if (!Number.isFinite(packageInfo.unpackedSize)) {
    failures.push('unpackedSize metadata missing');
  } else if (packageInfo.unpackedSize > budgets.maxUnpackedSize) {
    failures.push(`unpackedSize ${packageInfo.unpackedSize} > ${budgets.maxUnpackedSize}`);
  }

  if (failures.length > 0) {
    throw new Error(`npm package exceeds budgets: ${failures.join(', ')} (${budgets.id})`);
  }
}

function requireSinglePackage(packages: PackageInfo[]): PackageInfo {
  if (!Array.isArray(packages) || packages.length !== 1) {
    throw new Error('Expected npm pack to report exactly one package');
  }

  return packages[0] as PackageInfo;
}

function verifyPackageShape(packageInfo: PackageInfo): string[] {
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

  return entries;
}

function verifyPackageEntries(packages: PackageInfo[], options: VerifyPackageOptions = {}): VerifyPackageResult {
  const packageInfo = requireSinglePackage(packages);
  const entries = verifyPackageShape(packageInfo);

  if (options.enforceBudgets !== false) {
    assertPackageBudgets(packageInfo, entries, options.budgets || PACKAGE_BUDGETS.final);
  }

  return {
    budget: options.enforceBudgets === false
      ? 'not-enforced'
      : (options.budgets || PACKAGE_BUDGETS.final).id,
    entryCount: entries.length,
    filename: packageInfo.filename,
    packedSize: packageInfo.size,
    unpackedSize: packageInfo.unpackedSize,
  };
}

function verifyNpmPack(root: string = ROOT, options: VerifyPackageOptions = {}): VerifyPackageResult {
  return verifyPackageEntries(runNpmPackDryRun(root), options);
}

runAsMain(import.meta.url, 'npm pack verification', () => {
  const result = verifyNpmPack();
  console.log(
    `Verified npm pack contents: ${result.filename} ` +
    `(${result.entryCount} files, ${result.packedSize} packed bytes, ` +
    `${result.unpackedSize} unpacked bytes)`
  );
});

export { FINAL_PACKAGE_BUDGETS, PACKAGE_BUDGETS, PACKAGE_SURFACE_RULES, PRIVATE_SCRIPT_ROLES, assertPackageBudgets, assertPositivePackageInventory, assertNoPackagedRootScripts, classifyPackageEntry, parsePackJson, runNpmPackDryRun, verifyNpmPack, verifyPackageEntries, verifyPackageShape };
