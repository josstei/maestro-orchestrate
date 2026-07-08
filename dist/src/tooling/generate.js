#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { resolve as resolveTransform } from '../transforms/index.js';
import { createGenerationSession } from '../generator/generation-session.js';
import { expandManifest, assertNoMirroredSharedOutputs, buildRuntimeOutputPath } from '../generator/manifest-expander.js';
import { pruneStaleFiles } from '../generator/stale-pruner.js';
import { collectRegistryOutputs } from '../generator/registry-scanner.js';
import { expandEntryPoints, expandCoreCommands } from '../generator/entry-point-expander.js';
import { collectManifestPaths } from '../generator/manifest-curator.js';
import { OWNED_GENERATED_DIRS } from '../generator/generated-surface-inventory.js';
import { assertCrossReferences } from '../generator/cross-reference-validator.js';
import { buildPlatformMetadataOutputs } from '../platforms/metadata.js';
import { buildPolicyTomlOutputs } from '../generator/policy-toml-emitter.js';
import { buildHookConfigOutputs } from '../generator/hook-config-emitter.js';
import { buildContentFileOutputs } from '../generator/content-file-emitter.js';
import { readJson, resolvePackageRoot, runAsMain } from './lib/cli.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = resolvePackageRoot(moduleDirname);
const SRC = path.join(ROOT, 'src');
const moduleRelativePath = path.relative(ROOT, moduleDirname).split(path.sep).join('/');
const RUNTIME_CODE_SRC = moduleRelativePath.startsWith('dist/')
    ? path.join(ROOT, 'dist', 'src')
    : SRC;
const ENTRY_POINT_EXPANDERS = [expandEntryPoints, expandCoreCommands];
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const diffMode = args.includes('--diff');
const cleanMode = args.includes('--clean');
const listOutputs = args.includes('--list-outputs');
async function loadRuntimes() {
    const runtimes = {};
    const configs = fs.readdirSync(path.join(RUNTIME_CODE_SRC, 'platforms'), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== 'shared')
        .map((e) => path.join(e.name, 'runtime-config.js'))
        .filter((rel) => fs.existsSync(path.join(RUNTIME_CODE_SRC, 'platforms', rel)));
    for (const file of configs) {
        const { default: config } = await import(pathToFileURL(path.join(RUNTIME_CODE_SRC, 'platforms', file)).href);
        runtimes[config.name] = config;
    }
    return runtimes;
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
                const context = {
                    src: entry.src,
                    outputPath,
                    state,
                    ...(param ? { param } : {}),
                };
                content = fn(content, runtime, context);
            }
            session.write(outputPath, content);
        }
        catch (err) {
            session.reportError(`processing ${entry.src} -> ${outputPath}`, err);
        }
    }
}
async function processEntryPoints(runtimes, session) {
    for (const fn of ENTRY_POINT_EXPANDERS) {
        for (const runtimeName of Object.keys(runtimes)) {
            for (const { outputPath, content } of await fn(runtimeName, SRC, RUNTIME_CODE_SRC)) {
                session.write(outputPath, content);
            }
        }
    }
}
async function main() {
    const runtimes = await loadRuntimes();
    const packageMetadata = readJson(path.join(ROOT, 'package.json'));
    const { default: manifestRules } = await import(pathToFileURL(path.join(SRC, 'manifest.js')).href);
    const manifest = expandManifest(manifestRules, runtimes, SRC);
    assertNoMirroredSharedOutputs(manifest);
    await assertCrossReferences(SRC);
    const session = createGenerationSession({
        rootDir: ROOT,
        dryRun: dryRun || listOutputs,
        diffMode,
        quiet: listOutputs,
    });
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
    await processEntryPoints(runtimes, session);
    session.writeAll(await buildPlatformMetadataOutputs(runtimes, packageMetadata));
    session.writeAll(buildPolicyTomlOutputs());
    session.writeAll(buildHookConfigOutputs(runtimes));
    session.writeAll(buildContentFileOutputs(runtimes, SRC, packageMetadata));
    const stats = session.getStats();
    if (listOutputs) {
        console.log(session.getPlannedPaths().sort().join('\n'));
    }
    else if (dryRun) {
        console.log('\n(dry-run — no files written)');
    }
    else if (!diffMode) {
        console.log(`\nGeneration complete: ${stats.written} written, ${stats.unchanged} unchanged, ${stats.errors} errors`);
    }
    if (!session.isReadOnlyMode()) {
        const manifestPaths = await collectManifestPaths(manifest, runtimes, SRC, ENTRY_POINT_EXPANDERS, RUNTIME_CODE_SRC);
        const { pruned } = pruneStaleFiles({ rootDir: ROOT, manifestPaths, ownedDirs: [...OWNED_GENERATED_DIRS] });
        if (pruned.length > 0) {
            console.log('\nPruning stale files (not in manifest):');
            for (const f of pruned)
                console.log(`  PRUNED: ${f}`);
        }
        console.log('\nDetached payloads: none');
    }
    if (stats.errors > 0)
        process.exit(1);
}
runAsMain(import.meta.url, 'Generator', main);
export { assertNoMirroredSharedOutputs, buildRuntimeOutputPath, expandCoreCommands, buildPlatformMetadataOutputs, expandManifest, expandEntryPoints, OWNED_GENERATED_DIRS };
