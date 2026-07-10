import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleDirname } from '../core/module-path.js';
import { buildMetadataContext } from './metadata-shared.js';
import type { MetadataContext, MetadataOutput, PackageJsonLike } from './metadata-shared.js';
const MODULE_DIR = moduleDirname(import.meta.url);

interface MetadataBuilderModule {
  readonly buildMetadataOutputs?: (context: MetadataContext) => MetadataOutput[];
}

async function loadMetadataBuilder(runtimeName: string): Promise<MetadataBuilderModule> {
  return import(pathToFileURL(path.join(MODULE_DIR, runtimeName, 'metadata.js')).href) as Promise<MetadataBuilderModule>;
}

async function buildPlatformMetadataOutputs(
  runtimes: Readonly<Record<string, unknown>>,
  pkg: PackageJsonLike
): Promise<MetadataOutput[]> {
  const context = buildMetadataContext(pkg);
  const outputs: MetadataOutput[] = [];

  for (const runtimeName of Object.keys(runtimes).sort()) {
    const metadata = await loadMetadataBuilder(runtimeName);
    if (typeof metadata.buildMetadataOutputs !== 'function') {
      continue;
    }

    outputs.push(...metadata.buildMetadataOutputs(context));
  }

  return outputs;
}

export { buildPlatformMetadataOutputs, loadMetadataBuilder };
