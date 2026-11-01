#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { FileWriter } = require('../src/generator/file-writer');
const { collectStubOutputs } = require('../src/generator/stub-outputs');
const { planDetachedPayload } = require('../src/generator/payload-builder');
const { collectRegistryOutputs } = require('../src/generator/registry-scanner');
const { buildRuntimeEntrypointOutputs, hasDetachedPayload } = require('../src/generator/runtime-entrypoints');
const { buildPlatformMetadataOutputs } = require('../src/platforms/metadata');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../src/platforms/runtime-config-map');
const { runCli } = require('./lib/cli');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const USAGE = `Generate the runtime outputs and detached payloads from src/.

Usage:
  node scripts/generate.js [--dry-run | --diff | --check] [--clean]

Options:
  --dry-run  Preview what the generator would change, without writing
  --diff     Show a unified diff of pending changes, without writing
  --check    List only pending changes, and exit 1 if there are any
  --clean    Delete the generated agent and shared-skill stubs, then regenerate
  --help     Show this help text
`;

function main({ dryRun, diffMode, check, cleanMode }) {
  const runtimes = Object.fromEntries(RUNTIME_NAMES.map((name) => [name, getRuntimeConfig(name)]));
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const writer = new FileWriter({ rootDir: ROOT, dryRun, diffMode, check });
  const registryOutputs = collectRegistryOutputs(SRC, ROOT);
  const stubOutputs = collectStubOutputs(SRC, runtimes, writer.reportError);
  const stubOutputPaths = stubOutputs.map(({ outputPath }) => outputPath);
  const outputs = [...registryOutputs, ...stubOutputs];

  // Keep imports inside main so errors receive runCli's generator prefix.
  const { entrySurfaceDir, expandEntryPoints, expandCoreCommands } = require('../src/generator/entry-point-expander');
  for (const expand of [expandEntryPoints, expandCoreCommands]) {
    for (const runtime of Object.values(runtimes)) outputs.push(...expand(runtime));
  }
  outputs.push(...buildPlatformMetadataOutputs(runtimes, packageMetadata));
  outputs.push(...buildRuntimeEntrypointOutputs(runtimes));
  if (writer.stats.errors > 0) process.exit(1);

  const sourceOverrides = new Map(registryOutputs.map(({ outputPath, content }) => [
    path.relative(SRC, path.join(ROOT, outputPath)).split(path.sep).join('/'), content,
  ]));
  // Validate every payload and snapshot its source bytes before ANY generated
  // file is written or cleaned. A broken final runtime cannot prune earlier ones.
  // Each payload directory is owned whole, so its stale files are pruned too.
  const payloads = [];
  for (const runtime of Object.values(runtimes).filter(hasDetachedPayload)) {
    const label = `${runtime.outputDir}src`;
    const plan = planDetachedPayload(SRC, runtime, packageMetadata.version, { sourceOverrides });
    outputs.push(...plan.outputs.map((output) => ({ ...output, outputPath: `${label}/${output.outputPath}` })));
    payloads.push({ label, fileCount: plan.outputs.length });
  }
  // Each runtime's agent-stub and entry-surface directories are owned whole too.
  const ownedDirs = [
    ...Object.values(runtimes).flatMap((runtime) => [
      ...(runtime.agentFrontmatter ? [path.posix.join(runtime.outputDir, 'agents')] : []),
      entrySurfaceDir(runtime),
    ]),
    ...payloads.map(({ label }) => label),
  ];
  const stale = writer.findStale(outputs, ownedDirs);

  if (cleanMode) {
    writer.clean(stubOutputPaths);
    if (!writer.readOnly) console.log('Cleaned generated agent and shared-skill stubs.');
  }
  writer.writeAll(outputs);
  if (writer.stats.errors > 0) process.exit(1);

  writer.prune(stale);
  if (dryRun) console.log('\n(dry-run — no files written)');
  if (check) {
    if (writer.stats.changed > 0 || stale.files.length > 0) {
      console.error("Generated files are out of sync with src/. Run 'node scripts/generate.js' and commit the changes.");
      process.exitCode = 1;
    } else {
      console.log('Generated files are in sync with src/.');
    }
  }
  if (writer.readOnly) return;

  const { stats } = writer;
  console.log(`\nGeneration complete: ${stats.changed} written, ${stats.unchanged} unchanged, ${stats.errors} errors`);
  const payloadSummary = payloads.map(({ label, fileCount }) =>
    `${label} (${fileCount} files, ${stale.files.filter((file) => file.startsWith(`${label}/`)).length} removed)`);
  console.log(`\nDetached payloads: ${payloadSummary.join(', ')}`);
}

runCli(module, {
  failure: 'Generator failed',
  booleans: { '--dry-run': 'dryRun', '--diff': 'diffMode', '--check': 'check', '--clean': 'cleanMode' },
  usage: USAGE,
}, main);
