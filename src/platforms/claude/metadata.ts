import { RUNTIME_DESCRIPTION, buildAuthor, buildPackageMcpConfig, renderJson } from '../metadata-shared.js';
import type { MetadataContext, MetadataOutput } from '../metadata-shared.js';
import { requireRuntimeDefinition } from '../runtime-declarations.js';

const DEFINITION = requireRuntimeDefinition('claude');

function buildClaudeMarketplace(context: MetadataContext): Record<string, unknown> {
  return {
    name: 'maestro-orchestrator',
    owner: {
      name: context.author.name,
    },
    metadata: {
      description: 'Maestro multi-agent orchestration platform for Claude Code',
      version: context.version,
    },
    plugins: [
      {
        name: 'maestro',
        source: {
          source: 'github',
          repo: 'josstei/maestro-orchestrate',
          ref: 'dist',
        },
        description: RUNTIME_DESCRIPTION,
        version: context.version,
        author: buildAuthor(context),
        homepage: context.homepage,
        repository: context.repository,
        license: context.license,
        keywords: [
          'orchestration',
          'multi-agent',
          'planning',
          'execution',
          'agents',
        ],
        category: 'productivity',
      },
    ],
  };
}

function buildClaudePluginManifest(context: MetadataContext): Record<string, unknown> {
  return {
    name: 'maestro',
    version: context.version,
    description: RUNTIME_DESCRIPTION,
    author: buildAuthor(context),
    license: context.license,
    hooks: './claude/hooks/claude-hooks.json',
    mcpServers: './claude/.mcp.json',
    homepage: context.homepage,
    repository: context.repository,
    keywords: [
      'orchestration',
      'multi-agent',
      'planning',
      'execution',
    ],
  };
}

function buildClaudeMcpConfig(context: MetadataContext): Record<string, unknown> {
  return buildPackageMcpConfig(context, DEFINITION.name);
}

function buildClaudeLocalMcpConfig() {
  return {
    mcpServers: {
      maestro: {
        command: 'node',
        args: ['${CLAUDE_PLUGIN_ROOT}/mcp/maestro-server.js'],
        cwd: '${CLAUDE_PLUGIN_ROOT}',
      },
    },
  };
}

function buildClaudeLocalPluginManifest(context: MetadataContext): Record<string, unknown> {
  return {
    name: 'maestro',
    version: context.version,
    description: RUNTIME_DESCRIPTION,
    author: buildAuthor(context),
    license: context.license,
    hooks: './hooks/claude-hooks.json',
    mcpServers: './.mcp.json',
    homepage: context.homepage,
    repository: context.repository,
    keywords: [
      'orchestration',
      'multi-agent',
      'planning',
      'execution',
    ],
  };
}

function buildMetadataOutputs(context: MetadataContext): MetadataOutput[] {
  const { marketplacePath, pluginManifestPath, mcpConfigPath } = DEFINITION.metadata;
  if (!marketplacePath || !pluginManifestPath || !mcpConfigPath) {
    throw new Error('Claude runtime declaration is missing metadata output paths');
  }

  return [
    {
      outputPath: marketplacePath,
      content: renderJson(buildClaudeMarketplace(context)),
    },
    {
      outputPath: pluginManifestPath,
      content: renderJson(buildClaudePluginManifest(context)),
    },
    {
      outputPath: mcpConfigPath,
      content: renderJson(buildClaudeMcpConfig(context)),
    },
  ];
}

export { buildClaudeLocalMcpConfig, buildClaudeLocalPluginManifest, buildClaudeMarketplace, buildClaudeMcpConfig, buildClaudePluginManifest, buildMetadataOutputs };
