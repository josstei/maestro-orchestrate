'use strict';

const {
  buildAuthor,
  renderJson,
} = require('../metadata-shared');

function buildCodexMarketplace() {
  return {
    name: 'maestro-orchestrator',
    interface: {
      displayName: 'Maestro Orchestrator',
    },
    plugins: [
      {
        name: 'maestro',
        source: {
          source: 'local',
          path: './plugins/maestro',
        },
        policy: {
          installation: 'AVAILABLE',
          authentication: 'ON_INSTALL',
        },
        category: 'Coding',
      },
    ],
  };
}

function buildCodexPluginManifest(context) {
  return {
    name: 'maestro',
    version: context.version,
    description: "Generated Codex runtime for Maestro's multi-agent design, planning, execution, and review workflows.",
    author: buildAuthor(context),
    homepage: context.homepage,
    repository: context.repository,
    license: context.license,
    keywords: [
      'orchestration',
      'multi-agent',
      'planning',
      'execution',
      'coding',
    ],
    skills: './skills/',
    mcpServers: './.mcp.json',
    apps: './.app.json',
    interface: {
      displayName: 'Maestro',
      shortDescription: 'Multi-agent coding orchestration for Codex',
      longDescription: 'Generated Codex runtime for Maestro. Shared methodology, templates, references, and agent personas stay aligned with the Gemini CLI and Claude Code runtimes while Codex-specific delegation and state handling stay isolated to this plugin.',
      developerName: context.author.name,
      category: 'Coding',
      capabilities: [
        'Interactive',
        'Write',
      ],
      websiteURL: context.homepage,
      defaultPrompt: [
        'Use Maestro to orchestrate a feature from design through implementation and review.',
        'Use Maestro to review my changes and block on critical or major findings.',
        'Use Maestro to debug a failing workflow and route investigation to the right specialist.',
      ],
      brandColor: '#2563EB',
    },
  };
}

function buildCodexMcpConfig(context) {
  return {
    mcpServers: {
      maestro: {
        command: 'npx',
        args: ['-y', '-p', `${context.packageName}@${context.version}`, 'maestro-mcp-server'],
        env: {
          MAESTRO_RUNTIME: 'codex',
        },
      },
    },
  };
}

function buildMetadataOutputs(context) {
  return [
    {
      outputPath: '.agents/plugins/marketplace.json',
      content: renderJson(buildCodexMarketplace(context)),
    },
    {
      outputPath: 'plugins/maestro/.codex-plugin/plugin.json',
      content: renderJson(buildCodexPluginManifest(context)),
    },
    {
      outputPath: 'plugins/maestro/.mcp.json',
      content: renderJson(buildCodexMcpConfig(context)),
    },
  ];
}

module.exports = {
  buildCodexMarketplace,
  buildCodexMcpConfig,
  buildCodexPluginManifest,
  buildMetadataOutputs,
};
