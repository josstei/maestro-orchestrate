'use strict';

const { MAESTRO_SETTINGS } = require('../config/settings-catalog');

const RUNTIME_DESCRIPTION = 'Multi-agent development orchestration platform — 39 specialists, 4-phase orchestration, native parallel subagents, persistent sessions, and standalone review/debug/security/perf/seo/a11y/compliance commands';

const BASE_KEYWORDS = ['orchestration', 'multi-agent', 'planning', 'execution'];

function normalizeRepositoryUrl(repository) {
  if (!repository) {
    return null;
  }

  const url = typeof repository === 'string' ? repository : repository.url;
  if (typeof url !== 'string' || url.length === 0) {
    return null;
  }

  return url.replace(/\.git$/, '');
}

function requirePackageField(pkg, field) {
  if (typeof pkg[field] !== 'string' || pkg[field].length === 0) {
    throw new Error(`package.json missing ${field}`);
  }

  return pkg[field];
}

function buildMetadataContext(pkg) {
  const repository = normalizeRepositoryUrl(pkg.repository);

  if (!repository) {
    throw new Error('package.json missing repository URL');
  }

  return {
    packageName: requirePackageField(pkg, 'name'),
    version: requirePackageField(pkg, 'version'),
    author: pkg.author || {},
    homepage: requirePackageField(pkg, 'homepage'),
    repository,
    license: requirePackageField(pkg, 'license'),
  };
}

function buildAuthor(context) {
  return {
    name: context.author.name,
    email: context.author.email,
    url: context.author.url,
  };
}

function buildExtensionManifest(context, runtime, contextFileName) {
  return {
    name: 'maestro',
    version: context.version,
    description: RUNTIME_DESCRIPTION,
    contextFileName,
    settings: MAESTRO_SETTINGS,
    mcpServers: {
      maestro: {
        command: 'node',
        args: ['${extensionPath}/mcp/maestro-server.js'],
        cwd: '${extensionPath}',
        env: {
          MAESTRO_RUNTIME: runtime,
          MAESTRO_WORKSPACE_PATH: '${workspacePath}',
        },
      },
    },
  };
}

// Per-runtime metadata files, as ordered [outputPath, value] pairs.
const METADATA_BUILDERS = {
  claude: (context) => [
    ['.claude-plugin/marketplace.json', {
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
          keywords: [...BASE_KEYWORDS, 'agents'],
          category: 'productivity',
        },
      ],
    }],
    ['claude/.claude-plugin/plugin.json', {
      name: 'maestro',
      version: context.version,
      description: RUNTIME_DESCRIPTION,
      author: buildAuthor(context),
      license: context.license,
      hooks: './hooks/claude-hooks.json',
      mcpServers: './.mcp.json',
      homepage: context.homepage,
      repository: context.repository,
      keywords: BASE_KEYWORDS,
    }],
    ['claude/.mcp.json', {
      mcpServers: {
        maestro: {
          command: 'node',
          args: ['${CLAUDE_PLUGIN_ROOT}/mcp/maestro-server.js'],
          cwd: '${CLAUDE_PLUGIN_ROOT}',
        },
      },
    }],
  ],
  codex: (context) => [
    ['.agents/plugins/marketplace.json', {
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
    }],
    ['plugins/maestro/.codex-plugin/plugin.json', {
      name: 'maestro',
      version: context.version,
      description: "Generated Codex runtime for Maestro's multi-agent design, planning, execution, and review workflows.",
      author: buildAuthor(context),
      homepage: context.homepage,
      repository: context.repository,
      license: context.license,
      keywords: [...BASE_KEYWORDS, 'coding'],
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
    }],
    ['plugins/maestro/.mcp.json', {
      mcpServers: {
        maestro: {
          command: 'npx',
          args: ['-y', '-p', `${context.packageName}@${context.version}`, 'maestro-mcp-server'],
          env: {
            MAESTRO_RUNTIME: 'codex',
          },
        },
      },
    }],
  ],
  gemini: (context) => [
    ['gemini-extension.json', buildExtensionManifest(context, 'gemini', 'GEMINI.md')],
  ],
  qwen: (context) => [
    ['qwen-extension.json', buildExtensionManifest(context, 'qwen', 'QWEN.md')],
  ],
};

function buildPlatformMetadataOutputs(runtimes, pkg) {
  const context = buildMetadataContext(pkg);

  return Object.keys(runtimes).sort().flatMap((runtimeName) =>
    METADATA_BUILDERS[runtimeName](context).map(([outputPath, value]) => ({
      outputPath,
      content: `${JSON.stringify(value, null, 2)}\n`,
    }))
  );
}

module.exports = {
  buildPlatformMetadataOutputs,
};
