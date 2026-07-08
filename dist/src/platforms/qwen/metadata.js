import { buildExtensionManifest, renderJson } from '../metadata-shared.js';
function buildQwenExtensionManifest(context) {
    return buildExtensionManifest(context, {
        contextFileName: 'QWEN.md',
        runtime: 'qwen',
    });
}
function buildMetadataOutputs(context) {
    return [
        {
            outputPath: 'qwen-extension.json',
            content: renderJson(buildQwenExtensionManifest(context)),
        },
    ];
}
export { buildMetadataOutputs, buildQwenExtensionManifest };
