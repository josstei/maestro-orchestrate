#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { resolve: resolveTransform } = require('../src/transforms');
const { createGenerationSession } = require('../src/generator/generation-session');
const { expandManifest, assertNoMirroredSharedOutputs, buildRuntimeOutputPath } = require('../src/generator/manifest-expander');
const { pruneStaleFiles } = require('../src/generator/stale-pruner');
const { buildDetachedPayload, stampVersion, buildPayloadAllowlist, shouldIncludeInPayload, shouldDescendInto } = require('../src/generator/payload-builder');
const { collectRegistryOutputs } = require('../src/generator/registry-scanner');
const { expandEntryPoints, expandCoreCommands } = require('../src/generator/entry-point-expander');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OWNED_DIRS = ['agents', 'claude/agents', 'claude/skills', 'plugins/maestro/skills', 'commands'];
const ENTRY_POINT_EXPANDERS = [expandEntryPoints, expandCoreCommands];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const diffMode = args.includes('--diff');
const cleanMode = args.includes('--clean');

function loadRuntimes() {
  const runtimes = {};
  const configs = fs.readdirSync(path.join(SRC, 'platforms'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'shared')
    .map((e) => path.join(e.name, 'runtime-config.js'))
    .filter((rel) => fs.existsSync(path.join(SRC, 'platforms', rel)));
  for (const file of configs) {
    const config = require(path.join(SRC, 'platforms', file));
    runtimes[config.name] = config;
  }
  return runtimes;
}

function collectManifestPaths(manifest, runtimes) {
  const paths = new Set();
  for (const entry of manifest) {
    for (const p of Object.values(entry.outputs)) paths.add(p);
  }
  for (const fn of ENTRY_POINT_EXPANDERS) {
    for (const rt of Object.keys(runtimes)) {
      for (const { outputPath } of fn(rt, SRC)) paths.add(outputPath);
    }
  }
  return paths;
}

function processManifestEntry(entry, runtimes, session) {
  const srcPath = path.join(SRC, entry.src);
  if (!fs.existsSync(srcPath)) {
    session.reportError(`Source not found: ${entry.src}`);
    return;
  }

  const sourceContent = fs.readFileSync(srcPath, 'utf8');
  for (const [runtimeName, outputPath] of Object.entries(entry.outputs)) {
    const runtime = runtimes[runtimeName];
    if (!runtime) {
      session.reportError(`Unknown runtime "${runtimeName}" for ${entry.src}`);
      continue;
    }

    try {
      let content = sourceContent;
      const state = {};
      for (const transformName of entry.transforms) {
        const { fn, param } = resolveTransform(transformName);
        content = fn(content, runtime, { src: entry.src, param, outputPath, state });
      }
      session.write(outputPath, content);
    } catch (err) {
      session.reportError(`processing ${entry.src} -> ${outputPath}`, err);
    }
  }
}

function processEntryPoints(runtimes, session) {
  for (const fn of ENTRY_POINT_EXPANDERS) {
    for (const runtimeName of Object.keys(runtimes)) {
      for (const { outputPath, content } of fn(runtimeName, SRC)) {
        session.write(outputPath, content);
      }
    }
  }
}

async function main() {
  const runtimes = loadRuntimes();
  const manifestRules = require(path.join(SRC, 'manifest'));
  const manifest = expandManifest(manifestRules, runtimes, SRC);
  assertNoMirroredSharedOutputs(manifest);

  const session = createGenerationSession({ rootDir: ROOT, dryRun, diffMode });
  session.writeAll(collectRegistryOutputs(SRC, ROOT));

  if (cleanMode) {
    session.clean(manifest.flatMap((entry) => Object.values(entry.outputs)));
  }

  if (cleanMode && !session.isReadOnlyMode()) {
    console.log('Cleaned all generator-owned files.');
  }

  for (const entry of manifest) {
    processManifestEntry(entry, runtimes, session);
  }

  processEntryPoints(runtimes, session);

  const stats = session.getStats();

  if (dryRun) {
    console.log('\n(dry-run — no files written)');
  } else if (!diffMode) {
    console.log(`\nGeneration complete: ${stats.written} written, ${stats.unchanged} unchanged, ${stats.errors} errors`);
  }

  if (!session.isReadOnlyMode()) {
    const manifestPaths = collectManifestPaths(manifest, runtimes);
    const { pruned } = pruneStaleFiles({ rootDir: ROOT, manifestPaths, ownedDirs: OWNED_DIRS });
    if (pruned.length > 0) {
      console.log('\nPruning stale files (not in manifest):');
      for (const f of pruned) console.log(`  PRUNED: ${f}`);
    }

    const claudePayloadDir = path.join(ROOT, 'claude', 'src');
    const codexPayloadDir = path.join(ROOT, 'plugins', 'maestro', 'src');
    const claudeStats = buildDetachedPayload(SRC, claudePayloadDir, 'claude');
    const codexStats = buildDetachedPayload(SRC, codexPayloadDir, 'codex');
    const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    stampVersion([claudePayloadDir, codexPayloadDir], pkgVersion);
    console.log(
      `\nDetached payloads: claude/src (${claudeStats.copied} updated, ${claudeStats.removed} removed), ` +
      `plugins/maestro/src (${codexStats.copied} updated, ${codexStats.removed} removed)`
    );
  }

  if (stats.errors > 0) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Generator failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  assertNoMirroredSharedOutputs,
  buildPayloadAllowlist,
  buildRuntimeOutputPath,
  buildDetachedPayload,
  expandCoreCommands,
  expandManifest,
  expandEntryPoints,
  shouldDescendInto,
  shouldIncludeInPayload,
};
