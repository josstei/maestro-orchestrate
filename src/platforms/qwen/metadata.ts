import { buildExtensionManifest, renderJson } from '../metadata-shared.js';
import type { MetadataContext, MetadataOutput } from '../metadata-shared.js';

function buildQwenExtensionManifest(context: MetadataContext): Record<string, unknown> {
  return buildExtensionManifest(context, {
    contextFileName: 'QWEN.md',
    runtime: 'qwen',
  });
}

function buildMetadataOutputs(context: MetadataContext): MetadataOutput[] {
  return [
    {
      outputPath: 'qwen-extension.json',
      content: renderJson(buildQwenExtensionManifest(context)),
    },
  ];
}

export { buildMetadataOutputs, buildQwenExtensionManifest };
