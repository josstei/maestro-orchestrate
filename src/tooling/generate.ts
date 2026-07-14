#!/usr/bin/env node
import path from 'node:path';
import manifestRules from '../manifest.js';
import { resolve as resolveTransform } from '../transforms/index.js';
import { createGenerationSession } from '../generator/generation-session.js';
import { expandManifest, assertNoMirroredSharedOutputs, buildRuntimeOutputPath } from '../generator/manifest-expander.js';
import { pruneStaleFiles } from '../generator/stale-pruner.js';
import { buildRegistryModel, collectRegistryOutputs } from '../generator/registry-scanner.js';
import { createFileRuntimeContentOutput } from '../generator/runtime-content-manifest.js';
import { readAgentSourceContent } from '../core/agent-sources.js';
import { expandEntryPoints, expandCoreCommands } from '../generator/entry-point-expander.js';
import { OWNED_GENERATED_DIRS } from '../generator/generated-surface-inventory.js';
import { assertCrossReferences } from '../generator/cross-reference-validator.js';
import { buildPlatformMetadataOutputs } from '../platforms/metadata.js';
import { buildPolicyTomlOutputs } from '../generator/policy-toml-emitter.js';
import { buildHookConfigOutputs } from '../generator/hook-config-emitter.js';
import { buildContentFileOutputs } from '../generator/content-file-emitter.js';
import { moduleDirname } from '../core/package-root.js';
import { resolvePackageRoot } from '../core/package-root.js';
import { listRuntimeDefinitions } from '../platforms/runtime-declarations.js';
import type { RuntimeDefinition } from '../platforms/runtime-declarations.js';
import { readJson, runAsMain } from './lib/cli.js';
import type { RuntimeConfig } from '../platforms/runtime-descriptor.js';
const MODULE_DIR = moduleDirname(import.meta.url);
const ROOT = resolvePackageRoot(MODULE_DIR, { malformedJson: 'throw' });
const SRC = path.join(ROOT, 'src');
const ENTRY_POINT_EXPANDERS = [expandEntryPoints, expandCoreCommands];
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const diffMode = args.includes('--diff');
const cleanMode = args.includes('--clean');
const listOutputs = args.includes('--list-outputs');

type ManifestEntry = {
  src: string;
  outputs: Record<string, string>;
  transforms: string[];
};

type GenerationSession = {
  reportError: (message: string, error?: unknown) => void;
  write: (outputPath: string, content: string) => void;
  writeAll: (outputs: any) => void;
  clean: (paths: string[]) => void;
  isReadOnlyMode: () => boolean;
  getStats: () => { written: number; unchanged: number; errors: number };
  getPlannedPaths: () => string[];
};

function runtimeConfigMap(definitions: readonly RuntimeDefinition[]): Record<string, RuntimeConfig> {
  return Object.fromEntries(definitions.map((definition) => [definition.name, definition.config]));
}

function processManifestEntry(entry: ManifestEntry, runtimes: Record<string, RuntimeConfig>, session: GenerationSession): void {
  let sourceContent: string;
  try {
    sourceContent = readAgentSourceContent(SRC, entry.src);
  } catch (err) {
    session.reportError(`Source not found: ${entry.src}`, err);
    return;
  }

  for (const [runtimeName, outputPath] of Object.entries(entry.outputs)) {
    const runtime = runtimes[runtimeName];
    if (!runtime) {
      session.reportError(`Unknown runtime "${runtimeName}" for ${entry.src}`);
      continue;
    }

    try {
      let content = sourceContent;
      const state: Record<string, unknown> = {};
      for (const transformName of entry.transforms) {
        const { fn, param } = resolveTransform(transformName);
        const context = {
          src: entry.src,
          outputPath,
          state,
          ...(param ? { param } : {}),
        };
        content = fn(content, runtime, context);
      }
      session.write(outputPath, content);
    } catch (err) {
      session.reportError(`processing ${entry.src} -> ${outputPath}`, err);
    }
  }
}

async function processEntryPoints(definitions: readonly RuntimeDefinition[], session: GenerationSession): Promise<void> {
  for (const fn of ENTRY_POINT_EXPANDERS) {
    for (const definition of definitions) {
      for (const { outputPath, content } of await fn(definition, SRC)) {
        session.write(outputPath, content);
      }
    }
  }
}

async function main() {
  const definitions = listRuntimeDefinitions();
  const runtimes = runtimeConfigMap(definitions);
  const packageMetadata = readJson(path.join(ROOT, 'package.json'));
  const registryModel = buildRegistryModel(SRC);
  const manifest = expandManifest(manifestRules, runtimes, SRC) as ManifestEntry[];
  assertNoMirroredSharedOutputs(manifest);
  await assertCrossReferences(registryModel);

  const session = createGenerationSession({
    rootDir: ROOT,
    dryRun: dryRun || listOutputs,
    diffMode,
    quiet: listOutputs,
  });
  session.writeAll(collectRegistryOutputs(registryModel));
  session.writeAll([createFileRuntimeContentOutput(SRC, registryModel)]);

  if (cleanMode) {
    session.clean(manifest.flatMap((entry) => Object.values(entry.outputs)));
  }

  if (cleanMode && !session.isReadOnlyMode()) {
    console.log('Cleaned all generator-owned files.');
  }

  for (const entry of manifest) {
    processManifestEntry(entry, runtimes, session);
  }

  await processEntryPoints(definitions, session);
  session.writeAll(await buildPlatformMetadataOutputs(definitions, packageMetadata));
  session.writeAll(buildPolicyTomlOutputs());
  session.writeAll(buildHookConfigOutputs(runtimes));
  session.writeAll(buildContentFileOutputs(definitions, SRC, packageMetadata, registryModel.agents));

  const manifestPaths = new Set(session.getPlannedPaths());
  const stats = session.getStats();

  if (listOutputs) {
    console.log([...manifestPaths].sort().join('\n'));
  } else if (dryRun) {
    console.log('\n(dry-run — no files written)');
  } else if (!diffMode) {
    console.log(`\nGeneration complete: ${stats.written} written, ${stats.unchanged} unchanged, ${stats.errors} errors`);
  }

  if (!session.isReadOnlyMode()) {
    const { pruned } = pruneStaleFiles({ rootDir: ROOT, manifestPaths, ownedDirs: [...OWNED_GENERATED_DIRS] });
    if (pruned.length > 0) {
      console.log('\nPruning stale files (not in manifest):');
      for (const f of pruned) console.log(`  PRUNED: ${f}`);
    }
  }

  if (stats.errors > 0) process.exit(1);
}

runAsMain(import.meta.url, 'Generator', main);
export { assertNoMirroredSharedOutputs, buildRuntimeOutputPath, expandCoreCommands, buildPlatformMetadataOutputs, expandManifest, expandEntryPoints, OWNED_GENERATED_DIRS };
