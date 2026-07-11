#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs as parseNodeArgs } from 'node:util';
import { REQUIRED_PACKAGE_FILES, isDeniedPath } from './release-artifact-manifest.js';
import {
  FINAL_PACKAGE_BUDGETS,
  PACKAGE_BUDGETS,
  PACKAGE_SURFACE_RULES,
  PRIVATE_SCRIPT_ROLES,
  type PackageBudget,
  type PackageSurfaceRule,
} from './artifact-policy.js';
import { moduleDirname } from '../core/module-path.js';
import { resolvePackageRoot } from '../core/package-root.js';
import { runAsMain } from './lib/cli.js';

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

type PackExecutionOptions = {
  ignoreScripts?: boolean;
};

type VerifyNpmPackOptions = VerifyPackageOptions & {
  pack?: PackExecutionOptions;
};

type VerifyPackageResult = {
  budget: string;
  entryCount: number;
  filename: string;
  packedSize: number;
  unpackedSize: number;
};

const ROOT = resolvePackageRoot(moduleDirname(import.meta.url), { malformedJson: 'throw' });

function parsePackJson(stdout: string): PackageInfo[] {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`npm pack did not emit JSON output:\n${stdout}`);
  }

  return JSON.parse(stdout.slice(start, end + 1));
}

function parsePackExecutionArgs(argv: readonly string[] = []): PackExecutionOptions {
  const { values } = parseNodeArgs({
    args: [...argv],
    options: {
      'ignore-scripts': { type: 'boolean' },
    },
    allowPositionals: false,
    strict: true,
  });

  return values['ignore-scripts'] === true
    ? { ignoreScripts: true }
    : {};
}

function runNpmPackDryRun(
  root: string = ROOT,
  options: PackExecutionOptions = {},
): PackageInfo[] {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-npm-pack-cache-'));

  try {
    const args = ['pack', '--dry-run', '--json', '--cache', cacheDir];
    if (options.ignoreScripts === true) {
      args.push('--ignore-scripts');
    }

    const stdout = execFileSync('npm', args, {
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

function verifyNpmPack(root: string = ROOT, options: VerifyNpmPackOptions = {}): VerifyPackageResult {
  const { pack, ...packageOptions } = options;
  return verifyPackageEntries(runNpmPackDryRun(root, pack), packageOptions);
}

runAsMain(import.meta.url, 'npm pack verification', () => {
  const result = verifyNpmPack(ROOT, {
    pack: parsePackExecutionArgs(process.argv.slice(2)),
  });
  console.log(
    `Verified npm pack contents: ${result.filename} ` +
    `(${result.entryCount} files, ${result.packedSize} packed bytes, ` +
    `${result.unpackedSize} unpacked bytes)`
  );
});

export { FINAL_PACKAGE_BUDGETS, PACKAGE_BUDGETS, PACKAGE_SURFACE_RULES, PRIVATE_SCRIPT_ROLES, assertPackageBudgets, assertPositivePackageInventory, assertNoPackagedRootScripts, classifyPackageEntry, parsePackExecutionArgs, parsePackJson, runNpmPackDryRun, verifyNpmPack, verifyPackageEntries, verifyPackageShape };
export type { PackExecutionOptions, VerifyNpmPackOptions, VerifyPackageOptions };
