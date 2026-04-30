'use strict';

const RUNTIME_DESCRIPTION = 'Multi-agent development orchestration platform — 39 specialists, 4-phase orchestration, native parallel subagents, persistent sessions, and standalone review/debug/security/perf/seo/a11y/compliance commands';

function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

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
  if (!pkg || typeof pkg[field] !== 'string' || pkg[field].length === 0) {
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

function buildSettings() {
  return [
    {
      name: 'Disabled Agents',
      description: 'Comma-separated list of agent names to exclude from implementation planning.',
      envVar: 'MAESTRO_DISABLED_AGENTS',
    },
    {
      name: 'Max Retries',
      description: 'Maximum retry attempts per phase before escalating to user.',
      envVar: 'MAESTRO_MAX_RETRIES',
    },
    {
      name: 'Auto Archive',
      description: 'Automatically archive session state on successful completion (true/false).',
      envVar: 'MAESTRO_AUTO_ARCHIVE',
    },
    {
      name: 'Validation',
      description: 'Post-phase validation strictness level (strict/normal/lenient).',
      envVar: 'MAESTRO_VALIDATION_STRICTNESS',
    },
    {
      name: 'State Directory',
      description: 'Base directory for session state and plans (default: docs/maestro).',
      envVar: 'MAESTRO_STATE_DIR',
    },
    {
      name: 'Max Concurrent',
      description: 'Maximum subagents emitted in one native parallel batch turn (0 = dispatch the entire ready batch).',
      envVar: 'MAESTRO_MAX_CONCURRENT',
    },
    {
      name: 'Execution Mode',
      description: "Phase 3 execution mode: 'parallel' (native concurrent subagents), 'sequential' (one at a time), or 'ask' (prompt each time). Default: ask.",
      envVar: 'MAESTRO_EXECUTION_MODE',
    },
  ];
}

function buildExtensionMcpServer(runtime) {
  const env = {};

  if (runtime === 'qwen' || runtime === 'gemini') {
    env.MAESTRO_WORKSPACE_PATH = '${workspacePath}';
  }

  return {
    command: 'node',
    args: ['${extensionPath}/mcp/maestro-server.js'],
    cwd: '${extensionPath}',
    env,
  };
}

function buildExtensionManifest(context, options) {
  return {
    name: 'maestro',
    version: context.version,
    description: RUNTIME_DESCRIPTION,
    contextFileName: options.contextFileName,
    settings: buildSettings(),
    mcpServers: {
      maestro: buildExtensionMcpServer(options.runtime),
    },
  };
}

function buildAuthor(context) {
  return {
    name: context.author.name,
    email: context.author.email,
    url: context.author.url,
  };
}

module.exports = {
  RUNTIME_DESCRIPTION,
  buildAuthor,
  buildExtensionManifest,
  buildMetadataContext,
  buildSettings,
  normalizeRepositoryUrl,
  renderJson,
};
