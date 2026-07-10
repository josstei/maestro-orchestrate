import { buildMetadataOutputs as buildClaudeMetadataOutputs } from './claude/metadata.js';
import { buildMetadataOutputs as buildCodexMetadataOutputs } from './codex/metadata.js';
import { buildMetadataOutputs as buildGeminiMetadataOutputs } from './gemini/metadata.js';
import { buildMetadataOutputs as buildQwenMetadataOutputs } from './qwen/metadata.js';
import { buildMetadataContext } from './metadata-shared.js';
import type { MetadataContext, MetadataOutput, PackageJsonLike } from './metadata-shared.js';
import type { RuntimeDefinition } from './runtime-declarations.js';
import type { RuntimeName } from './runtime-descriptor.js';

type MetadataRenderer = (context: MetadataContext) => MetadataOutput[];

const RUNTIME_METADATA_RENDERERS: Readonly<Record<RuntimeName, MetadataRenderer>> = Object.freeze({
  claude: buildClaudeMetadataOutputs,
  codex: buildCodexMetadataOutputs,
  gemini: buildGeminiMetadataOutputs,
  qwen: buildQwenMetadataOutputs,
});

function selectedRuntimeNames(definitions: readonly RuntimeDefinition[]): RuntimeName[] {
  return definitions.map((definition) => definition.name).sort();
}

async function buildPlatformMetadataOutputs(
  definitions: readonly RuntimeDefinition[],
  pkg: PackageJsonLike
): Promise<MetadataOutput[]> {
  const context = buildMetadataContext(pkg);
  const outputs: MetadataOutput[] = [];

  for (const runtimeName of selectedRuntimeNames(definitions)) {
    outputs.push(...RUNTIME_METADATA_RENDERERS[runtimeName](context));
  }

  return outputs;
}

export { RUNTIME_METADATA_RENDERERS, buildPlatformMetadataOutputs };
