import type { RuntimeName } from './runtime-descriptor.js';

const RUNTIME_DESCRIPTION = 'Multi-agent development orchestration platform — 39 specialists, 4-phase orchestration, native parallel subagents, persistent sessions, and standalone review/debug/security/perf/seo/a11y/compliance commands';

export interface PackageAuthor {
  readonly name?: string;
  readonly email?: string;
  readonly url?: string;
}

export interface PackageJsonLike {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly author?: PackageAuthor;
  readonly homepage?: unknown;
  readonly repository?: string | { readonly url?: unknown };
  readonly license?: unknown;
}

export interface MetadataContext {
  readonly packageName: string;
  readonly version: string;
  readonly author: PackageAuthor;
  readonly homepage: string;
  readonly repository: string;
  readonly license: string;
}

export interface MetadataOutput {
  readonly outputPath: string;
  readonly content: string;
}

interface ExtensionManifestOptions {
  readonly contextFileName: string;
  readonly runtime: RuntimeName;
}

function renderJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizeRepositoryUrl(repository: PackageJsonLike['repository']): string | null {
  if (!repository) {
    return null;
  }

  const url = typeof repository === 'string' ? repository : repository.url;
  if (typeof url !== 'string' || url.length === 0) {
    return null;
  }

  return url.replace(/\.git$/, '');
}

function requirePackageField(pkg: PackageJsonLike, field: keyof PackageJsonLike): string {
  if (!pkg || typeof pkg[field] !== 'string' || pkg[field].length === 0) {
    throw new Error(`package.json missing ${field}`);
  }

  return pkg[field];
}

function buildMetadataContext(pkg: PackageJsonLike): MetadataContext {
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

function buildSettings(): Array<{ name: string; description: string; envVar: string }> {
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

function buildExtensionMcpServer(context: MetadataContext, runtime: RuntimeName): { command: string; args: string[]; env: Record<string, string> } {
  const env: Record<string, string> = {
    MAESTRO_RUNTIME: runtime,
  };

  if (runtime === 'qwen' || runtime === 'gemini') {
    env.MAESTRO_WORKSPACE_PATH = '${workspacePath}';
  }

  return {
    command: 'npx',
    args: ['-y', '-p', `${context.packageName}@${context.version}`, 'maestro-mcp-server'],
    env,
  };
}

function buildExtensionManifest(context: MetadataContext, options: ExtensionManifestOptions): Record<string, unknown> {
  return {
    name: 'maestro',
    version: context.version,
    description: RUNTIME_DESCRIPTION,
    contextFileName: options.contextFileName,
    settings: buildSettings(),
    mcpServers: {
      maestro: buildExtensionMcpServer(context, options.runtime),
    },
  };
}

function buildAuthor(context: MetadataContext): PackageAuthor {
  return {
    ...(context.author.name !== undefined ? { name: context.author.name } : {}),
    ...(context.author.email !== undefined ? { email: context.author.email } : {}),
    ...(context.author.url !== undefined ? { url: context.author.url } : {}),
  };
}

export { RUNTIME_DESCRIPTION, buildAuthor, buildExtensionManifest, buildMetadataContext, buildSettings, normalizeRepositoryUrl, renderJson };
