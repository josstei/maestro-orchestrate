#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createFileWriter, safeResolve } = require('../src/generator/file-writer');
const { collectStubOutputs } = require('../src/generator/stub-outputs');
const { pruneStaleFiles } = require('../src/generator/stale-pruner');
const { planDetachedPayload } = require('../src/generator/payload-builder');
const { collectRegistryOutputs } = require('../src/generator/registry-scanner');
const { buildRuntimeEntrypointOutputs } = require('../src/generator/runtime-entrypoints');
const { buildPlatformMetadataOutputs } = require('../src/platforms/metadata');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../src/platforms/runtime-config-map');
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
  const writer = createFileWriter({ rootDir: ROOT, dryRun, diffMode });
  const registryOutputs = collectRegistryOutputs(SRC, ROOT);
  const stubOutputs = collectStubOutputs(SRC, runtimes, writer.reportError);
  const stubOutputPaths = stubOutputs.map(({ outputPath }) => outputPath);
  const outputs = [...registryOutputs, ...stubOutputs];

  // Keep imports inside main so errors receive runCli's generator prefix.
  const { expandEntryPoints, expandCoreCommands } = require('../src/generator/entry-point-expander');
  const entryPointPaths = [];
  for (const expand of [expandEntryPoints, expandCoreCommands]) {
    for (const runtimeName of Object.keys(runtimes)) {
      const entries = expand(runtimeName);
      outputs.push(...entries);
      entryPointPaths.push(...entries.map(({ outputPath }) => outputPath));
    }
  }
  outputs.push(...buildPlatformMetadataOutputs(runtimes, packageMetadata));
  outputs.push(...buildRuntimeEntrypointOutputs(runtimes));
  if (writer.getStats().errors > 0) process.exit(1);

  const sourceOverrides = new Map(registryOutputs.map(({ outputPath, content }) => [
    path.relative(SRC, path.join(ROOT, outputPath)).split(path.sep).join('/'), content,
  ]));
  // Validate every payload and snapshot its source bytes before ANY generated
  // file is written or cleaned. A broken final runtime cannot prune earlier ones.
  const payloadPlans = PAYLOAD_RUNTIMES.map((runtimeName) => {
    const label = `${runtimes[runtimeName].outputDir}src`;
    return {
      label,
      ...planDetachedPayload(SRC, path.join(ROOT, label), runtimeName, packageMetadata.version, { sourceOverrides }),
    };
  });
  const manifestPaths = new Set([...stubOutputPaths, ...entryPointPaths]);
  for (const { outputPath } of outputs) safeResolve(outputPath, ROOT, { requireFile: true });
  for (const ownedDir of OWNED_DIRS) safeResolve(ownedDir, ROOT);
  const stale = pruneStaleFiles({ rootDir: ROOT, manifestPaths, ownedDirs: OWNED_DIRS, dryRun: true }).pruned;

  if (cleanMode) {
    writer.clean(stubOutputPaths);
    if (!readOnlyMode) console.log('Cleaned generated agent and shared-skill stubs.');
  }
  writer.writeAll(outputs);
  for (const plan of payloadPlans) {
    writer.writeAll(plan.outputs.map((output) => ({ ...output, outputPath: `${plan.label}/${output.outputPath}` })));
  }
  if (writer.getStats().errors > 0) process.exit(1);

  const removedPaths = [
    ...stale,
    ...payloadPlans.flatMap((plan) => plan.removedPaths.map((file) => `${plan.label}/${file}`)),
  ].sort();
  if (readOnlyMode) {
    for (const file of removedPaths) console.log(dryRun ? `[REMOVE] ${file}` : `--- REMOVED: ${file}`);
    if (dryRun) console.log('\n(dry-run — no files written)');
    return;
  }

  pruneStaleFiles({ rootDir: ROOT, manifestPaths, ownedDirs: OWNED_DIRS });
  for (const plan of payloadPlans) {
    pruneStaleFiles({ rootDir: plan.outputDir, manifestPaths: plan.manifestPaths, ownedDirs: [''] });
  }
  for (const file of removedPaths) console.log(`  PRUNED: ${file}`);
  const stats = writer.getStats();
  console.log(`\nGeneration complete: ${stats.written} written, ${stats.unchanged} unchanged, ${stats.errors} errors`);
  console.log(`\nDetached payloads: ${payloadPlans.map((plan) => `${plan.label} (${plan.outputs.length} files, ${plan.removedPaths.length} removed)`).join(', ')}`);
}

runCli('Generator failed', main);
