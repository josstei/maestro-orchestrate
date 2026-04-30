'use strict';

const {
  RUNTIME_DESCRIPTION,
  buildAuthor,
  renderJson,
} = require('../metadata-shared');

function buildClaudeMarketplace(context) {
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
        source: './claude',
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

function buildClaudePluginManifest(context) {
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

function buildClaudeMcpConfig() {
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

function buildMetadataOutputs(context) {
  return [
    {
      outputPath: '.claude-plugin/marketplace.json',
      content: renderJson(buildClaudeMarketplace(context)),
    },
    {
      outputPath: 'claude/.claude-plugin/plugin.json',
      content: renderJson(buildClaudePluginManifest(context)),
    },
    {
      outputPath: 'claude/.mcp.json',
      content: renderJson(buildClaudeMcpConfig()),
    },
  ];
}

module.exports = {
  buildClaudeMarketplace,
  buildClaudeMcpConfig,
  buildClaudePluginManifest,
  buildMetadataOutputs,
};
