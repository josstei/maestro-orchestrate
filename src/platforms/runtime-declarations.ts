import { CLAUDE_RUNTIME_CONFIG } from './claude/runtime-config.js';
import { CODEX_RUNTIME_CONFIG } from './codex/runtime-config.js';
import { GEMINI_RUNTIME_CONFIG } from './gemini/runtime-config.js';
import { QWEN_RUNTIME_CONFIG } from './qwen/runtime-config.js';
import type { RuntimeConfig, RuntimeName } from './runtime-descriptor.js';

const PACKAGE_MCP_SERVER = Object.freeze({
  command: 'npx',
  args: ['-y', '-p', '@josstei/maestro@${version}', 'maestro-mcp-server'],
  entrypoint: 'dist/src/bin/maestro-mcp-server.js',
});

const RUNTIME_CONTENT_ROOT = Object.freeze({
  provider: 'registry',
  srcRoot: 'dist/src',
});

export interface RuntimeMetadataDeclaration {
  readonly extensionManifest?: {
    readonly outputPath: string;
    readonly contextFileName: string;
  };
  readonly marketplacePath?: string;
  readonly pluginManifestPath?: string;
  readonly mcpConfigPath?: string;
}

export interface RuntimeSurfaceFacts {
  readonly startupManifest: string;
  readonly generatedSurfaces: readonly string[];
  readonly docs: readonly string[];
}

export interface RuntimeDefinition {
  readonly name: RuntimeName;
  readonly config: RuntimeConfig;
  readonly metadata: RuntimeMetadataDeclaration;
  readonly payload: RuntimeSurfaceFacts;
}

const RUNTIME_DEFINITIONS: Readonly<Record<RuntimeName, RuntimeDefinition>> = Object.freeze({
  gemini: Object.freeze({
    name: 'gemini',
    config: GEMINI_RUNTIME_CONFIG,
    metadata: Object.freeze({
      extensionManifest: Object.freeze({
        outputPath: 'gemini-extension.json',
        contextFileName: 'GEMINI.md',
      }),
    }),
    payload: Object.freeze({
      startupManifest: 'gemini-extension.json',
      generatedSurfaces: Object.freeze([
        'agents/',
        'commands/',
        'hooks/',
        'mcp/',
        'policies/',
        'GEMINI.md',
        'gemini-extension.json',
      ]),
      docs: Object.freeze(['docs/runtime-gemini.md', 'GEMINI.md']),
    }),
  }),
  claude: Object.freeze({
    name: 'claude',
    config: CLAUDE_RUNTIME_CONFIG,
    metadata: Object.freeze({
      marketplacePath: '.claude-plugin/marketplace.json',
      pluginManifestPath: '.claude-plugin/plugin.json',
      mcpConfigPath: 'claude/.mcp.json',
    }),
    payload: Object.freeze({
      startupManifest: 'claude/.mcp.json',
      generatedSurfaces: Object.freeze([
        '.claude-plugin/marketplace.json',
        '.claude-plugin/plugin.json',
        'claude/.mcp.json',
        'claude/agents/',
        'claude/hooks/',
        'claude/mcp/',
        'claude/scripts/',
        'claude/skills/',
      ]),
      docs: Object.freeze(['docs/runtime-claude.md', 'claude/README.md']),
    }),
  }),
  codex: Object.freeze({
    name: 'codex',
    config: CODEX_RUNTIME_CONFIG,
    metadata: Object.freeze({
      marketplacePath: '.agents/plugins/marketplace.json',
      pluginManifestPath: 'plugins/maestro/.codex-plugin/plugin.json',
      mcpConfigPath: 'plugins/maestro/.mcp.json',
    }),
    payload: Object.freeze({
      startupManifest: 'plugins/maestro/.mcp.json',
      generatedSurfaces: Object.freeze([
        '.agents/plugins/marketplace.json',
        'plugins/maestro/.app.json',
        'plugins/maestro/.codex-plugin/plugin.json',
        'plugins/maestro/.mcp.json',
        'plugins/maestro/references/',
        'plugins/maestro/skills/',
      ]),
      docs: Object.freeze([
        'docs/runtime-codex.md',
        'plugins/maestro/references/runtime-guide.md',
      ]),
    }),
  }),
  qwen: Object.freeze({
    name: 'qwen',
    config: QWEN_RUNTIME_CONFIG,
    metadata: Object.freeze({
      extensionManifest: Object.freeze({
        outputPath: 'qwen-extension.json',
        contextFileName: 'QWEN.md',
      }),
    }),
    payload: Object.freeze({
      startupManifest: 'qwen-extension.json',
      generatedSurfaces: Object.freeze([
        'qwen/agents/',
        'qwen/hooks.json',
        'QWEN.md',
        'qwen-extension.json',
        'mcp/',
      ]),
      docs: Object.freeze(['docs/runtime-qwen.md', 'QWEN.md']),
    }),
  }),
});
const RUNTIME_DEFINITION_LIST = Object.freeze(Object.values(RUNTIME_DEFINITIONS));

function listRuntimeDefinitions(): readonly RuntimeDefinition[] {
  return RUNTIME_DEFINITION_LIST;
}

function getRuntimeDefinition(name: string): RuntimeDefinition | null {
  return Object.prototype.hasOwnProperty.call(RUNTIME_DEFINITIONS, name)
    ? RUNTIME_DEFINITIONS[name as RuntimeName]
    : null;
}

function requireRuntimeDefinition(name: RuntimeName): RuntimeDefinition {
  const definition = getRuntimeDefinition(name);
  if (!definition) {
    throw new Error(`Unknown runtime definition: ${name}`);
  }
  return definition;
}

function getRuntimeConfig(name: RuntimeName | string): RuntimeConfig {
  const definition = getRuntimeDefinition(name);
  if (!definition) {
    throw new Error(`Unknown runtime config: ${name}`);
  }
  return definition.config;
}

function metadataOutputPaths(): string[] {
  return listRuntimeDefinitions()
    .flatMap(({ metadata }) => [
      metadata.extensionManifest?.outputPath,
      metadata.marketplacePath,
      metadata.pluginManifestPath,
      metadata.mcpConfigPath,
    ].filter(Boolean) as string[])
    .sort();
}

export {
  PACKAGE_MCP_SERVER,
  RUNTIME_CONTENT_ROOT,
  RUNTIME_DEFINITIONS,
  getRuntimeConfig,
  getRuntimeDefinition,
  listRuntimeDefinitions,
  metadataOutputPaths,
  requireRuntimeDefinition,
};
