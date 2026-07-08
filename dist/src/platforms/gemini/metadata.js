import { buildExtensionManifest, renderJson } from '../metadata-shared.js';
function buildGeminiExtensionManifest(context) {
    return buildExtensionManifest(context, {
        contextFileName: 'GEMINI.md',
        runtime: 'gemini',
    });
}
function buildMetadataOutputs(context) {
    return [
        {
            outputPath: 'gemini-extension.json',
            content: renderJson(buildGeminiExtensionManifest(context)),
        },
    ];
}
export { buildGeminiExtensionManifest, buildMetadataOutputs };
