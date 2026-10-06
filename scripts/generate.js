#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { resolve: resolveTransform } = require('../src/transforms');
const { createFileWriter } = require('../src/generator/file-writer');
const { expandManifest, assertNoMirroredSharedOutputs } = require('../src/generator/manifest-expander');
const { pruneStaleFiles } = require('../src/generator/stale-pruner');
const { buildDetachedPayload, stampVersion } = require('../src/generator/payload-builder');
const { collectRegistryOutputs } = require('../src/generator/registry-scanner');
const { expandEntryPoints, expandCoreCommands } = require('../src/generator/entry-point-expander');
const { buildPlatformMetadataOutputs } = require('../src/platforms/metadata');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OWNED_DIRS = ['agents', 'claude/agents', 'claude/skills', 'plugins/maestro/skills', 'commands'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const diffMode = args.includes('--diff');
const cleanMode = args.includes('--clean');
const readOnlyMode = dryRun || diffMode;

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

function processManifestEntry(entry, runtimes, writer) {
  const srcPath = path.join(SRC, entry.src);
  if (!fs.existsSync(srcPath)) {
    writer.reportError(`Source not found: ${entry.src}`);
    return;
  }

  const sourceContent = fs.readFileSync(srcPath, 'utf8');
  for (const [runtimeName, outputPath] of Object.entries(entry.outputs)) {
    const runtime = runtimes[runtimeName];
    try {
      let content = sourceContent;
      for (const transformName of entry.transforms) {
        const fn = resolveTransform(transformName);
        content = fn(content, runtime);
      }
      writer.write(outputPath, content);
    } catch (err) {
      writer.reportError(`processing ${entry.src} -> ${outputPath}`, err);
    }
  }
}

function processEntryPoints(runtimes, writer) {
  const outputPaths = [];
  for (const fn of [expandEntryPoints, expandCoreCommands]) {
    for (const runtimeName of Object.keys(runtimes)) {
      for (const { outputPath, content } of fn(runtimeName, SRC)) {
        writer.write(outputPath, content);
        outputPaths.push(outputPath);
      }
    }
  }
  return outputPaths;
}

async function main() {
  const runtimes = loadRuntimes();
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const manifestRules = require(path.join(SRC, 'manifest'));
  const manifest = expandManifest(manifestRules, runtimes, SRC);
  assertNoMirroredSharedOutputs(manifest);
  const manifestOutputPaths = manifest.flatMap((entry) => Object.values(entry.outputs));

  const writer = createFileWriter({ rootDir: ROOT, dryRun, diffMode });
  writer.writeAll(collectRegistryOutputs(SRC, ROOT));

  if (cleanMode) {
    try {
      writer.clean(manifestOutputPaths);
    } catch (err) {
      writer.reportError('cleaning generated files', err);
    }
    if (!readOnlyMode) console.log('Cleaned all generator-owned files.');
  }

  for (const entry of manifest) {
    processManifestEntry(entry, runtimes, writer);
  }

  const entryPointPaths = processEntryPoints(runtimes, writer);
  writer.writeAll(buildPlatformMetadataOutputs(runtimes, packageMetadata));

  const stats = writer.getStats();

  if (dryRun) {
    console.log('\n(dry-run — no files written)');
  } else if (!diffMode) {
    console.log(`\nGeneration complete: ${stats.written} written, ${stats.unchanged} unchanged, ${stats.errors} errors`);
  }

  if (!readOnlyMode) {
    const manifestPaths = new Set([...manifestOutputPaths, ...entryPointPaths]);
    const { pruned } = pruneStaleFiles({ rootDir: ROOT, manifestPaths, ownedDirs: OWNED_DIRS });
    if (pruned.length > 0) {
      console.log('\nPruning stale files (not in manifest):');
      for (const f of pruned) console.log(`  PRUNED: ${f}`);
    }

    const claudePayloadDir = path.join(ROOT, 'claude', 'src');
    const codexPayloadDir = path.join(ROOT, 'plugins', 'maestro', 'src');
    const claudeStats = buildDetachedPayload(SRC, claudePayloadDir, 'claude');
    const codexStats = buildDetachedPayload(SRC, codexPayloadDir, 'codex');
    stampVersion([claudePayloadDir, codexPayloadDir], packageMetadata.version);
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
