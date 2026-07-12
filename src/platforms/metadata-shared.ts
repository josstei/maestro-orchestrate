import type { RuntimeName } from './runtime-descriptor.js';
import type { RuntimeDefinition } from './runtime-declarations.js';
import { SETTINGS_SCHEMA, SETTING_NAMES } from '../config/settings-schema.js';

const RUNTIME_DESCRIPTION = 'Multi-agent development orchestration platform — 39 specialists, 4-phase orchestration, native parallel subagents, persistent sessions, and standalone review/debug/security/perf/seo/a11y/compliance commands';
const RUNTIME_FACTS_SECTION_START = '<!-- BEGIN GENERATED RUNTIME FACTS -->';
const RUNTIME_FACTS_SECTION_END = '<!-- END GENERATED RUNTIME FACTS -->';

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
  return SETTING_NAMES.flatMap((envVar) => {
    const { presentation } = SETTINGS_SCHEMA[envVar];
    if (!presentation.extensionVisible) return [];
    return [{
      name: presentation.label,
      description: presentation.description,
      envVar,
    }];
  });
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

function buildPackageMcpConfig(context: MetadataContext, runtime: RuntimeName): Record<string, unknown> {
  return {
    mcpServers: {
      maestro: buildExtensionMcpServer(context, runtime),
    },
  };
}

function buildExtensionManifest(context: MetadataContext, options: ExtensionManifestOptions): Record<string, unknown> {
  return {
    name: 'maestro',
    version: context.version,
    description: RUNTIME_DESCRIPTION,
    contextFileName: options.contextFileName,
    settings: buildSettings(),
    mcpServers: buildPackageMcpConfig(context, options.runtime).mcpServers,
  };
}

function buildAuthor(context: MetadataContext): PackageAuthor {
  return {
    ...(context.author.name !== undefined ? { name: context.author.name } : {}),
    ...(context.author.email !== undefined ? { email: context.author.email } : {}),
    ...(context.author.url !== undefined ? { url: context.author.url } : {}),
  };
}

function renderRuntimeFactsSection(definition: RuntimeDefinition): string {
  return [
    RUNTIME_FACTS_SECTION_START,
    '',
    `- **Runtime name**: \`${definition.name}\``,
    `- **Output directory**: \`${definition.config.outputDir}\``,
    `- **Agent naming**: \`${definition.config.agentNaming}\``,
    `- **Startup manifest**: \`${definition.payload.startupManifest}\``,
    '- **Generated surfaces**:',
    ...definition.payload.generatedSurfaces.map((surface) => `  - \`${surface}\``),
    '- **Runtime documentation**:',
    ...definition.payload.docs.map((docPath) => `  - \`${docPath}\``),
    '',
    RUNTIME_FACTS_SECTION_END,
  ].join('\n');
}

export {
  RUNTIME_DESCRIPTION,
  RUNTIME_FACTS_SECTION_END,
  RUNTIME_FACTS_SECTION_START,
  buildAuthor,
  buildExtensionManifest,
  buildMetadataContext,
  buildPackageMcpConfig,
  buildSettings,
  normalizeRepositoryUrl,
  renderJson,
  renderRuntimeFactsSection,
};
