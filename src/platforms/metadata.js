import path from 'node:path';
import { buildMetadataContext } from './metadata-shared.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);

async function loadMetadataBuilder(runtimeName) {
  return import(pathToFileURL(path.join(moduleDirname, runtimeName, 'metadata.js')).href);
}

async function buildPlatformMetadataOutputs(runtimes, pkg) {
  const context = buildMetadataContext(pkg);
  const outputs = [];

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
