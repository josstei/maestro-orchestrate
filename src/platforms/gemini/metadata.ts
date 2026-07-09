import { buildExtensionManifest, renderJson } from '../metadata-shared.js';
import type { MetadataContext, MetadataOutput } from '../metadata-shared.js';
import { requireRuntimeDeclaration } from '../runtime-declarations.js';

const DECLARATION = requireRuntimeDeclaration('gemini');

function buildGeminiExtensionManifest(context: MetadataContext): Record<string, unknown> {
  const extensionManifest = DECLARATION.metadata.extensionManifest;
  if (!extensionManifest) {
    throw new Error('Gemini runtime declaration is missing extension manifest metadata');
  }
  return buildExtensionManifest(context, {
    contextFileName: extensionManifest.contextFileName,
    runtime: DECLARATION.name,
  });
}

function buildMetadataOutputs(context: MetadataContext): MetadataOutput[] {
  const extensionManifest = DECLARATION.metadata.extensionManifest;
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
