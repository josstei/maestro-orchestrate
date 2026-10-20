#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createFileWriter } = require('../src/generator/file-writer');
const { expandManifest, assertNoMirroredSharedOutputs, renderManifest } = require('../src/generator/manifest-expander');
const { pruneStaleFiles } = require('../src/generator/stale-pruner');
const { buildDetachedPayload } = require('../src/generator/payload-builder');
const { collectRegistryOutputs } = require('../src/generator/registry-scanner');
const { buildPlatformMetadataOutputs } = require('../src/platforms/metadata');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../src/mcp/runtime/runtime-config-map');
const { runCli } = require('./lib/cli');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OWNED_DIRS = ['agents', 'antigravity/agents', 'antigravity/skills', 'claude/agents', 'claude/skills', 'plugins/maestro/skills', 'commands'];
const PAYLOAD_RUNTIMES = ['antigravity', 'claude', 'codex'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const diffMode = args.includes('--diff');
const cleanMode = args.includes('--clean');
const readOnlyMode = dryRun || diffMode;

function main() {
  const runtimes = Object.fromEntries(RUNTIME_NAMES.map((name) => [name, getRuntimeConfig(name)]));
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const manifestRules = require('../src/manifest');
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
    if (!readOnlyMode) console.log('Cleaned generated agent and shared-skill stubs.');
  }

  writer.writeAll(renderManifest(manifest, runtimes, SRC, writer.reportError));

  // Required here, not at the top, so a broken src/entry-points module is
  // reported with runCli's 'Generator failed' prefix like the manifest.
  const { expandEntryPoints, expandCoreCommands } = require('../src/generator/entry-point-expander');
  const entryPointPaths = [];
  for (const expand of [expandEntryPoints, expandCoreCommands]) {
    for (const runtimeName of Object.keys(runtimes)) {
      const outputs = expand(runtimeName);
      writer.writeAll(outputs);
      entryPointPaths.push(...outputs.map(({ outputPath }) => outputPath));
    }
  }
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

    const payloadSummaries = PAYLOAD_RUNTIMES.map((runtimeName) => {
      const label = `${runtimes[runtimeName].outputDir}src`;
      const { copied, removed } = buildDetachedPayload(
        SRC,
        path.join(ROOT, label),
        runtimeName,
        packageMetadata.version
      );
      return `${label} (${copied} updated, ${removed} removed)`;
    });
    console.log(`\nDetached payloads: ${payloadSummaries.join(', ')}`);
  }

  if (stats.errors > 0) process.exit(1);
}

runCli('Generator failed', main);
