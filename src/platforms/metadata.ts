import path from 'node:path';
import { buildMetadataContext } from './metadata-shared.js';
import type { MetadataContext, MetadataOutput, PackageJsonLike } from './metadata-shared.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);

interface MetadataBuilderModule {
  readonly buildMetadataOutputs?: (context: MetadataContext) => MetadataOutput[];
}

async function loadMetadataBuilder(runtimeName: string): Promise<MetadataBuilderModule> {
  return import(pathToFileURL(path.join(moduleDirname, runtimeName, 'metadata.js')).href) as Promise<MetadataBuilderModule>;
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
