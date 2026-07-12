import { buildExtensionManifest, renderJson } from '../metadata-shared.js';
import type { MetadataContext, MetadataOutput } from '../metadata-shared.js';
import { requireRuntimeDefinition } from '../runtime-declarations.js';

const DEFINITION = requireRuntimeDefinition('gemini');

function buildGeminiExtensionManifest(context: MetadataContext): Record<string, unknown> {
  const extensionManifest = DEFINITION.metadata.extensionManifest;
  if (!extensionManifest) {
    throw new Error('Gemini runtime declaration is missing extension manifest metadata');
  }
  return buildExtensionManifest(context, {
    contextFileName: extensionManifest.contextFileName,
    runtime: DEFINITION.name,
  });
}

function buildMetadataOutputs(context: MetadataContext): MetadataOutput[] {
  const extensionManifest = DEFINITION.metadata.extensionManifest;
  if (!extensionManifest) {
    throw new Error('Gemini runtime declaration is missing extension manifest metadata');
  }
  return [
    {
      outputPath: extensionManifest.outputPath,
      content: renderJson(buildGeminiExtensionManifest(context)),
    },
  ];
}

export { buildGeminiExtensionManifest, buildMetadataOutputs };
