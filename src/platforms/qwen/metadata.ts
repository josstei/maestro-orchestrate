import { buildExtensionManifest, renderJson } from '../metadata-shared.js';
import type { MetadataContext, MetadataOutput } from '../metadata-shared.js';
import { requireRuntimeDefinition } from '../runtime-declarations.js';

const DEFINITION = requireRuntimeDefinition('qwen');

function buildQwenExtensionManifest(context: MetadataContext): Record<string, unknown> {
  const extensionManifest = DEFINITION.metadata.extensionManifest;
  if (!extensionManifest) {
    throw new Error('Qwen runtime declaration is missing extension manifest metadata');
  }
  return buildExtensionManifest(context, {
    contextFileName: extensionManifest.contextFileName,
    runtime: DEFINITION.name,
  });
}

function buildMetadataOutputs(context: MetadataContext): MetadataOutput[] {
  const extensionManifest = DEFINITION.metadata.extensionManifest;
  if (!extensionManifest) {
    throw new Error('Qwen runtime declaration is missing extension manifest metadata');
  }
  return [
    {
      outputPath: extensionManifest.outputPath,
      content: renderJson(buildQwenExtensionManifest(context)),
    },
  ];
}

export { buildMetadataOutputs, buildQwenExtensionManifest };
