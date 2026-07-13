import { buildMetadataOutputs as buildClaudeMetadataOutputs } from './claude/metadata.js';
import { buildMetadataOutputs as buildCodexMetadataOutputs } from './codex/metadata.js';
import { buildExtensionManifest, buildMetadataContext, renderJson } from './metadata-shared.js';
import type { MetadataContext, MetadataOutput, PackageJsonLike } from './metadata-shared.js';
import type { RuntimeDefinition } from './runtime-declarations.js';
import type { RuntimeName } from './runtime-descriptor.js';

type MetadataRenderer = (context: MetadataContext) => MetadataOutput[];

const RUNTIME_METADATA_RENDERERS: Readonly<Partial<Record<RuntimeName, MetadataRenderer>>> = Object.freeze({
  claude: buildClaudeMetadataOutputs,
  codex: buildCodexMetadataOutputs,
});

function buildExtensionMetadataOutputs(
  definition: RuntimeDefinition,
  context: MetadataContext
): MetadataOutput[] {
  const extensionManifest = definition.metadata.extensionManifest;
  if (!extensionManifest) {
    throw new Error(`${definition.name} runtime declaration is missing extension manifest metadata`);
  }

  return [{
    outputPath: extensionManifest.outputPath,
    content: renderJson(buildExtensionManifest(context, {
      contextFileName: extensionManifest.contextFileName,
      runtime: definition.name,
    })),
  }];
}

async function buildPlatformMetadataOutputs(
  definitions: readonly RuntimeDefinition[],
  pkg: PackageJsonLike
): Promise<MetadataOutput[]> {
  const context = buildMetadataContext(pkg);
  const outputs: MetadataOutput[] = [];

  for (const definition of [...definitions].sort((left, right) => left.name.localeCompare(right.name))) {
    const renderer = RUNTIME_METADATA_RENDERERS[definition.name];
    outputs.push(...(renderer
      ? renderer(context)
      : buildExtensionMetadataOutputs(definition, context)));
  }

  return outputs;
}

export { RUNTIME_METADATA_RENDERERS, buildPlatformMetadataOutputs };
