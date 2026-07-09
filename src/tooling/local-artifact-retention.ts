#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePackageRoot, runAsMain } from './lib/cli.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = resolvePackageRoot(moduleDirname);

const DEFAULT_SESSION_ARCHIVE_RETENTION = 10;
const DEFAULT_PLAN_ARCHIVE_RETENTION = 10;
const CONFIRM_FLAG = '--confirm-prune-local-artifacts';

type RetentionAction = 'protect' | 'retain' | 'prune';

type RetentionCategory =
  | 'active-session'
  | 'build-output'
  | 'maestro-archive'
  | 'maestro-durable'
  | 'maestro-plan'
  | 'superpowers';

type RetentionEntry = Readonly<{
  action: RetentionAction;
  bytes: number;
  category: RetentionCategory;
  path: string;
  reason: string;
}>;

type RetentionOptions = Readonly<{
  apply?: boolean;
  confirm?: boolean;
  includeBuildOutputs?: boolean;
  includeSuperpowers?: boolean;
  maxPlanArchives?: number;
  maxSessionArchives?: number;
  root?: string;
}>;

type RetentionSummary = Readonly<{
  bytesByAction: Record<RetentionAction, number>;
  filesByAction: Record<RetentionAction, number>;
  prunableBytes: number;
  prunableFiles: number;
  totalBytes: number;
  totalFiles: number;
}>;

type RetentionPlan = Readonly<{
  entries: readonly RetentionEntry[];
  root: string;
  summary: RetentionSummary;
}>;

type ApplyRetentionResult = Readonly<{
  pruned: readonly string[];
  prunedBytes: number;
}>;

type ParsedArgs = RetentionOptions & Readonly<{
  format: 'human' | 'json';
}>;

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function normalizeRelativePath(relativePath: string): string {
  return toPosixPath(relativePath).replace(/^\.\//, '');
}

function resolveInside(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to inspect path outside the repository root: ${relativePath}`);
  }

  return resolvedPath;
}

function readFileBytes(root: string, relativePath: string): number {
  return fs.statSync(resolveInside(root, relativePath)).size;
}

function listFiles(root: string, relativeRoot: string): string[] {
  const absoluteRoot = resolveInside(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  const files: string[] = [];
  const queue = [relativeRoot];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }

    for (const entry of fs.readdirSync(resolveInside(root, current), { withFileTypes: true })) {
      const relativePath = normalizeRelativePath(path.join(current, entry.name));

      if (entry.isDirectory()) {
        queue.push(relativePath);
        continue;
      }

      if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  return files.sort();
}

function sortByMtimeDesc(root: string, files: readonly string[]): string[] {
  return [...files].sort((left, right) => {
    const leftStat = fs.statSync(resolveInside(root, left));
    const rightStat = fs.statSync(resolveInside(root, right));
    const mtimeDelta = rightStat.mtimeMs - leftStat.mtimeMs;

    return mtimeDelta === 0 ? left.localeCompare(right) : mtimeDelta;
  });
}

function entry(
  root: string,
  relativePath: string,
  category: RetentionCategory,
  action: RetentionAction,
  reason: string
): RetentionEntry {
  return Object.freeze({
    action,
    bytes: readFileBytes(root, relativePath),
    category,
    path: normalizeRelativePath(relativePath),
    reason,
  });
}

function isBuildOutput(relativePath: string): boolean {
  return (
    /^src\/generated\/[^/]+\.json$/.test(relativePath) ||
    /^dist\/src\/.+\.(?:d\.ts|d\.ts\.map|map)$/.test(relativePath)
  );
}

function collectMaestroEntries(
  root: string,
  options: Required<Pick<RetentionOptions, 'maxPlanArchives' | 'maxSessionArchives'>>
): RetentionEntry[] {
  const entries: RetentionEntry[] = [];
  const allMaestroFiles = new Set(listFiles(root, 'docs/maestro'));
  const activeSession = 'docs/maestro/state/active-session.md';

  if (allMaestroFiles.has(activeSession)) {
    entries.push(entry(root, activeSession, 'active-session', 'protect', 'active Maestro session state'));
    allMaestroFiles.delete(activeSession);
  }

  const sessionArchives = sortByMtimeDesc(
    root,
    [...allMaestroFiles].filter((filePath) => /^docs\/maestro\/state\/archive\/[^/]+\.md$/.test(filePath))
  );
  sessionArchives.forEach((archivePath, index) => {
    const retained = index < options.maxSessionArchives;
    entries.push(entry(
      root,
      archivePath,
      'maestro-archive',
      retained ? 'retain' : 'prune',
      retained
        ? `within newest ${options.maxSessionArchives} session archives`
        : `older than newest ${options.maxSessionArchives} session archives`
    ));
    allMaestroFiles.delete(archivePath);
  });

  const planArchives = sortByMtimeDesc(
    root,
    [...allMaestroFiles].filter((filePath) => /^docs\/maestro\/plans\/archive\/[^/]+$/.test(filePath))
  );
  planArchives.forEach((archivePath, index) => {
    const retained = index < options.maxPlanArchives;
    entries.push(entry(
      root,
      archivePath,
      'maestro-plan',
      retained ? 'retain' : 'prune',
      retained
        ? `within newest ${options.maxPlanArchives} archived plans`
        : `older than newest ${options.maxPlanArchives} archived plans`
    ));
    allMaestroFiles.delete(archivePath);
  });

  for (const filePath of [...allMaestroFiles].sort()) {
    const isDurable = (
      filePath.includes('/checkpoints/') ||
      filePath.includes('/knowledge/') ||
      filePath.includes('/memory/') ||
      filePath.endsWith('/.gitignore') ||
      filePath.endsWith('/.workspace-root') ||
      /^docs\/maestro\/plans\/[^/]+$/.test(filePath) ||
      /^docs\/maestro\/state\/[^/]+\.design-gate\.json$/.test(filePath)
    );
    entries.push(entry(
      root,
      filePath,
      isDurable ? 'maestro-durable' : 'maestro-archive',
      'retain',
      isDurable ? 'durable Maestro state or active planning input' : 'unclassified Maestro state retained by default'
    ));
  }

  return entries;
}

function collectBuildOutputEntries(root: string): RetentionEntry[] {
  return [...listFiles(root, 'src/generated'), ...listFiles(root, 'dist/src')]
    .filter(isBuildOutput)
    .sort()
    .map((filePath) => entry(root, filePath, 'build-output', 'prune', 'local generated build byproduct'));
}

function collectSuperpowersEntries(root: string): RetentionEntry[] {
  return [...listFiles(root, '.superpowers'), ...listFiles(root, 'docs/superpowers')]
    .sort()
    .map((filePath) => entry(root, filePath, 'superpowers', 'prune', 'ignored local Superpowers artifact'));
}

function summarize(entries: readonly RetentionEntry[]): RetentionSummary {
  const filesByAction: Record<RetentionAction, number> = { protect: 0, retain: 0, prune: 0 };
  const bytesByAction: Record<RetentionAction, number> = { protect: 0, retain: 0, prune: 0 };

  for (const planEntry of entries) {
    filesByAction[planEntry.action] += 1;
    bytesByAction[planEntry.action] += planEntry.bytes;
  }

  return Object.freeze({
    bytesByAction: Object.freeze(bytesByAction),
    filesByAction: Object.freeze(filesByAction),
    prunableBytes: bytesByAction.prune,
    prunableFiles: filesByAction.prune,
    totalBytes: entries.reduce((total, planEntry) => total + planEntry.bytes, 0),
    totalFiles: entries.length,
  });
}

function createRetentionPlan(options: RetentionOptions = {}): RetentionPlan {
  const root = path.resolve(options.root || ROOT);
  const maxPlanArchives = options.maxPlanArchives ?? DEFAULT_PLAN_ARCHIVE_RETENTION;
  const maxSessionArchives = options.maxSessionArchives ?? DEFAULT_SESSION_ARCHIVE_RETENTION;
  const entries = [
    ...collectMaestroEntries(root, { maxPlanArchives, maxSessionArchives }),
    ...(options.includeBuildOutputs === false ? [] : collectBuildOutputEntries(root)),
    ...(options.includeSuperpowers === false ? [] : collectSuperpowersEntries(root)),
  ].sort((left, right) => left.path.localeCompare(right.path));

  return Object.freeze({
    entries: Object.freeze(entries),
    root,
    summary: summarize(entries),
  });
}

function applyRetentionPlan(plan: RetentionPlan, options: RetentionOptions = {}): ApplyRetentionResult {
  if (!options.apply) {
    return Object.freeze({ pruned: Object.freeze([]), prunedBytes: 0 });
  }

  if (!options.confirm) {
    throw new Error(`Refusing to prune local artifacts without ${CONFIRM_FLAG}`);
  }

  const pruned: string[] = [];
  let prunedBytes = 0;

  for (const planEntry of plan.entries) {
    if (planEntry.action !== 'prune') {
      continue;
    }

    fs.rmSync(resolveInside(plan.root, planEntry.path), { force: true });
    pruned.push(planEntry.path);
    prunedBytes += planEntry.bytes;
  }

  return Object.freeze({ pruned: Object.freeze(pruned), prunedBytes });
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }

  return parsed;
}

function printHelp(): void {
  console.log(`Inventory and optionally prune ignored local Maestro artifacts.

Usage:
  node dist/src/tooling/local-artifact-retention.js [options]

Options:
  --apply                            Delete prune-candidate files.
  ${CONFIRM_FLAG}    Required with --apply.
  --json                             Print machine-readable JSON.
  --max-session-archives N           Keep newest N docs/maestro/state/archive/*.md files.
  --max-plan-archives N              Keep newest N docs/maestro/plans/archive/* files.
  --no-build-outputs                 Do not include src/generated or dist/src declaration/map byproducts.
  --no-superpowers                   Do not include .superpowers or docs/superpowers artifacts.
  --dry-run                          Explicit no-op mode; this is the default.
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const options: {
    apply?: boolean;
    confirm?: boolean;
    format: 'human' | 'json';
    includeBuildOutputs?: boolean;
    includeSuperpowers?: boolean;
    maxPlanArchives?: number;
    maxSessionArchives?: number;
  } = { format: 'human' };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--dry-run') {
      options.apply = false;
    } else if (arg === CONFIRM_FLAG) {
      options.confirm = true;
    } else if (arg === '--json') {
      options.format = 'json';
    } else if (arg === '--no-build-outputs') {
      options.includeBuildOutputs = false;
    } else if (arg === '--no-superpowers') {
      options.includeSuperpowers = false;
    } else if (arg === '--max-session-archives') {
      const value = argv[index + 1];
      if (!value) throw new Error('Missing value for --max-session-archives');
      options.maxSessionArchives = parsePositiveInteger(value, '--max-session-archives');
      index += 1;
    } else if (arg === '--max-plan-archives') {
      const value = argv[index + 1];
      if (!value) throw new Error('Missing value for --max-plan-archives');
      options.maxPlanArchives = parsePositiveInteger(value, '--max-plan-archives');
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return Object.freeze(options);
}

function printHumanReport(plan: RetentionPlan, result: ApplyRetentionResult): void {
  const mode = result.pruned.length > 0 ? 'applied' : 'dry-run';
  console.log(
    `Local artifact retention ${mode}: ${plan.summary.prunableFiles} prunable files, ` +
    `${plan.summary.prunableBytes} prunable bytes.`
  );

  for (const planEntry of plan.entries) {
    if (planEntry.action === 'prune') {
      console.log(`${planEntry.action}\t${planEntry.category}\t${planEntry.bytes}\t${planEntry.path}\t${planEntry.reason}`);
    }
  }
}

runAsMain(import.meta.url, 'local artifact retention', () => {
  const args = parseArgs(process.argv.slice(2));
  const plan = createRetentionPlan(args);
  const result = applyRetentionPlan(plan, args);

  if (args.format === 'json') {
    console.log(JSON.stringify({ ...plan, result }, null, 2));
  } else {
    printHumanReport(plan, result);
  }
});

export {
  CONFIRM_FLAG,
  applyRetentionPlan,
  createRetentionPlan,
  parseArgs,
  resolveInside,
};
export type {
  ApplyRetentionResult,
  ParsedArgs,
  RetentionEntry,
  RetentionOptions,
  RetentionPlan,
  RetentionSummary,
};
