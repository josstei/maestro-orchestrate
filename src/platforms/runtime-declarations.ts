import { runtimePackageInvariants } from '../tooling/artifact-policy.js';
import type { RuntimeName } from './runtime-descriptor.js';

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

export interface RuntimePayloadDeclaration {
  readonly startupManifest: string;
  readonly generatedSurfaces: readonly string[];
  readonly packageInvariants: readonly string[];
  readonly docs: readonly string[];
}

export interface RuntimeDeclaration {
  readonly name: RuntimeName;
  readonly metadata: RuntimeMetadataDeclaration;
  readonly payload: RuntimePayloadDeclaration;
}

const RUNTIME_DECLARATIONS = Object.freeze({
  gemini: {
    name: 'gemini',
    metadata: {
      extensionManifest: {
        outputPath: 'gemini-extension.json',
        contextFileName: 'GEMINI.md',
      },
    },
    payload: {
      startupManifest: 'gemini-extension.json',
      generatedSurfaces: [
        'agents/',
        'commands/',
        'hooks/',
        'mcp/',
        'policies/',
        'GEMINI.md',
        'gemini-extension.json',
      ],
      packageInvariants: runtimePackageInvariants('gemini'),
      docs: ['docs/runtime-gemini.md', 'GEMINI.md'],
    },
  },
  claude: {
    name: 'claude',
    metadata: {
      marketplacePath: '.claude-plugin/marketplace.json',
      pluginManifestPath: '.claude-plugin/plugin.json',
      mcpConfigPath: 'claude/.mcp.json',
    },
    payload: {
      startupManifest: 'claude/.mcp.json',
      generatedSurfaces: [
        '.claude-plugin/marketplace.json',
        '.claude-plugin/plugin.json',
        'claude/.mcp.json',
        'claude/agents/',
        'claude/hooks/',
        'claude/mcp/',
        'claude/scripts/',
        'claude/skills/',
      ],
      packageInvariants: runtimePackageInvariants('claude'),
      docs: ['docs/runtime-claude.md', 'claude/README.md'],
    },
  },
  codex: {
    name: 'codex',
    metadata: {
      marketplacePath: '.agents/plugins/marketplace.json',
      pluginManifestPath: 'plugins/maestro/.codex-plugin/plugin.json',
      mcpConfigPath: 'plugins/maestro/.mcp.json',
    },
    payload: {
      startupManifest: 'plugins/maestro/.mcp.json',
      generatedSurfaces: [
        '.agents/plugins/marketplace.json',
        'plugins/maestro/.app.json',
        'plugins/maestro/.codex-plugin/plugin.json',
        'plugins/maestro/.mcp.json',
        'plugins/maestro/references/',
        'plugins/maestro/skills/',
      ],
      packageInvariants: runtimePackageInvariants('codex'),
      docs: ['docs/runtime-codex.md', 'plugins/maestro/references/runtime-guide.md'],
    },
  },
  qwen: {
    name: 'qwen',
    metadata: {
      extensionManifest: {
        outputPath: 'qwen-extension.json',
        contextFileName: 'QWEN.md',
      },
    },
    payload: {
      startupManifest: 'qwen-extension.json',
      generatedSurfaces: [
        'qwen/agents/',
        'qwen/hooks.json',
        'QWEN.md',
        'qwen-extension.json',
        'mcp/',
      ],
      packageInvariants: runtimePackageInvariants('qwen'),
      docs: ['docs/runtime-qwen.md', 'QWEN.md'],
    },
  },
} satisfies Record<RuntimeName, RuntimeDeclaration>);

function listRuntimeDeclarations(): RuntimeDeclaration[] {
  return Object.values(RUNTIME_DECLARATIONS);
}

function getRuntimeDeclaration(runtimeName: RuntimeName | string): RuntimeDeclaration | null {
  return RUNTIME_DECLARATIONS[runtimeName as RuntimeName] || null;
}

function requireRuntimeDeclaration(runtimeName: RuntimeName): RuntimeDeclaration {
  const declaration = getRuntimeDeclaration(runtimeName);
  if (!declaration) {
    throw new Error(`Unknown runtime declaration: ${runtimeName}`);
  }
  return declaration;
}

function metadataOutputPaths(): string[] {
  return listRuntimeDeclarations()
    .flatMap((runtime) => {
      const metadata = runtime.metadata;
      return [
        metadata.extensionManifest?.outputPath,
        metadata.marketplacePath,
        metadata.pluginManifestPath,
        metadata.mcpConfigPath,
      ].filter(Boolean) as string[];
    })
    .sort();
}

export {
  PACKAGE_MCP_SERVER,
  RUNTIME_CONTENT_ROOT,
  RUNTIME_DECLARATIONS,
  getRuntimeDeclaration,
  listRuntimeDeclarations,
  metadataOutputPaths,
  requireRuntimeDeclaration,
};
