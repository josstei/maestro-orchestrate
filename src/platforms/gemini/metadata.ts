import { buildExtensionManifest, renderJson } from '../metadata-shared.js';
import type { MetadataContext, MetadataOutput } from '../metadata-shared.js';

function buildGeminiExtensionManifest(context: MetadataContext): Record<string, unknown> {
  return buildExtensionManifest(context, {
    contextFileName: 'GEMINI.md',
    runtime: 'gemini',
  });
}

function buildMetadataOutputs(context: MetadataContext): MetadataOutput[] {
  return [
    {
      outputPath: 'gemini-extension.json',
      content: renderJson(buildGeminiExtensionManifest(context)),
    },
  ];
}

export { buildGeminiExtensionManifest, buildMetadataOutputs };
