import { RUNTIME_DESCRIPTION, buildAuthor, renderJson } from '../metadata-shared.js';
import type { MetadataContext, MetadataOutput } from '../metadata-shared.js';

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
  return {
    mcpServers: {
      maestro: {
        command: 'npx',
        args: ['-y', '-p', `${context.packageName}@${context.version}`, 'maestro-mcp-server'],
        env: {
          MAESTRO_RUNTIME: 'claude',
        },
      },
    },
  };
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
  return [
    {
      outputPath: '.claude-plugin/marketplace.json',
      content: renderJson(buildClaudeMarketplace(context)),
    },
    {
      outputPath: '.claude-plugin/plugin.json',
      content: renderJson(buildClaudePluginManifest(context)),
    },
    {
      outputPath: 'claude/.mcp.json',
      content: renderJson(buildClaudeMcpConfig(context)),
    },
  ];
}

export { buildClaudeLocalMcpConfig, buildClaudeLocalPluginManifest, buildClaudeMarketplace, buildClaudeMcpConfig, buildClaudePluginManifest, buildMetadataOutputs };
