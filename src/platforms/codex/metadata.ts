import { buildAuthor, buildPackageMcpConfig, renderJson } from '../metadata-shared.js';
import type { MetadataContext, MetadataOutput } from '../metadata-shared.js';
import { requireRuntimeDeclaration } from '../runtime-declarations.js';

const DECLARATION = requireRuntimeDeclaration('codex');

function buildCodexMarketplace(context: MetadataContext): Record<string, unknown> {
  return {
    name: 'maestro-orchestrator',
    interface: {
      displayName: 'Maestro Orchestrator',
    },
    plugins: [
      {
        name: 'maestro',
        source: {
          source: 'git-subdir',
          url: `${context.repository}.git`,
          path: './plugins/maestro',
          ref: 'dist',
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

function buildCodexPluginManifest(context: MetadataContext): Record<string, unknown> {
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

function buildCodexMcpConfig(context: MetadataContext): Record<string, unknown> {
  return buildPackageMcpConfig(context, DECLARATION.name);
}

function buildMetadataOutputs(context: MetadataContext): MetadataOutput[] {
  const { marketplacePath, pluginManifestPath, mcpConfigPath } = DECLARATION.metadata;
  if (!marketplacePath || !pluginManifestPath || !mcpConfigPath) {
    throw new Error('Codex runtime declaration is missing metadata output paths');
  }

  return [
    {
      outputPath: marketplacePath,
      content: renderJson(buildCodexMarketplace(context)),
    },
    {
      outputPath: pluginManifestPath,
      content: renderJson(buildCodexPluginManifest(context)),
    },
    {
      outputPath: mcpConfigPath,
      content: renderJson(buildCodexMcpConfig(context)),
    },
  ];
}

export { buildCodexMarketplace, buildCodexMcpConfig, buildCodexPluginManifest, buildMetadataOutputs };
