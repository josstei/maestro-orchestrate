import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type RuntimeName = 'gemini' | 'claude' | 'codex' | 'qwen';
export type AgentNaming = 'snake_case' | 'kebab-case';
export type ToolMapping = string | readonly string[];
export type ToolDialect = Record<string, ToolMapping>;

export interface RuntimeEntry {
  readonly name: string;
}

export interface EntryPointDescriptor {
  readonly templateFile: string;
  readonly outputPath: (entry: RuntimeEntry) => string;
  readonly preamblePlaceholder: string;
}

export interface CoreCommandDescriptor {
  readonly templateFile: string;
  readonly outputPath: (entry: RuntimeEntry) => string;
}

export interface HookDescriptor {
  readonly family: 'gemini-family' | 'claude';
  readonly configOutputPath: string;
}

export interface RuntimeGenerationDescriptor {
  readonly entryPoint: EntryPointDescriptor | null;
  readonly coreCommand: CoreCommandDescriptor | null;
  readonly hooks: HookDescriptor | null;
}

export interface RuntimeEnvironmentConfig {
  readonly extensionPath?: string | null;
  readonly workspacePath?: string | null;
}

export interface RuntimeDelegationConfig {
  readonly pattern: string;
  readonly constraints: Readonly<Record<string, unknown>>;
}

export interface RuntimeAgentFrontmatterConfig {
  readonly kind?: string;
  readonly model?: string;
  readonly turnsField?: string;
  readonly hasTemperature?: boolean;
  readonly hasTimeout?: boolean;
}

export interface RuntimeConfig {
  readonly name: RuntimeName;
  readonly outputDir: string;
  readonly agentNaming: AgentNaming;
  readonly delegation: RuntimeDelegationConfig;
  readonly env: RuntimeEnvironmentConfig;
  readonly tools: ToolDialect;
  readonly mcpPrefix?: string;
  readonly plan_mode_native?: boolean;
  readonly relativeExtensionPath?: boolean;
  readonly agentToolDialect?: ToolDialect;
  readonly agentFrontmatter?: RuntimeAgentFrontmatterConfig;
  readonly features?: Readonly<Record<string, unknown>>;
  readonly paths?: Readonly<Record<string, string>>;
  readonly generation: RuntimeGenerationDescriptor;
  readonly hooks?: Readonly<Record<string, unknown>>;
  readonly contextFile?: Readonly<Record<string, unknown>>;
}

export type RuntimeConfigOverrides =
  Pick<RuntimeConfig, 'name' | 'outputDir' | 'env' | 'generation'> &
  Partial<Omit<RuntimeConfig, 'name' | 'outputDir' | 'env' | 'generation' | 'tools'>> & {
  readonly tools?: ToolDialect;
};

function isRenderableEntryConfig(value: unknown): value is EntryPointDescriptor | CoreCommandDescriptor {
  return (
    value != null &&
    typeof value === 'object' &&
    'templateFile' in value &&
    'outputPath' in value &&
    typeof value.templateFile === 'string' &&
    typeof value.outputPath === 'function'
  );
}

/**
 * Fail-closed validation that a runtime declares a well-formed generation descriptor.
 *
 */
function assertValidRuntimeGeneration(
  name: string,
  generation: RuntimeGenerationDescriptor | null | undefined
): asserts generation is RuntimeGenerationDescriptor {
  if (!generation || typeof generation !== 'object') {
    throw new Error(`Runtime "${name}" is missing its generation descriptor`);
  }

  const { entryPoint, coreCommand, hooks } = generation;

  if (entryPoint !== null) {
    if (!isRenderableEntryConfig(entryPoint) || typeof entryPoint.preamblePlaceholder !== 'string') {
      throw new Error(`Runtime "${name}" has a malformed entryPoint descriptor`);
    }
  }

  if (coreCommand !== null && !isRenderableEntryConfig(coreCommand)) {
    throw new Error(`Runtime "${name}" has a malformed coreCommand descriptor`);
  }

  if (hooks !== null) {
    if (hooks.family !== 'gemini-family' && hooks.family !== 'claude') {
      throw new Error(`Runtime "${name}" declares an unknown hook family "${hooks.family}"`);
    }
    if (typeof hooks.configOutputPath !== 'string') {
      throw new Error(`Runtime "${name}" has a malformed hooks descriptor`);
    }
  }
}

/**
 * Validated read of a runtime config's generation descriptor.
 *
 */
function getRuntimeGeneration(config: { name: string; generation?: RuntimeGenerationDescriptor | null }): RuntimeGenerationDescriptor {
  assertValidRuntimeGeneration(config.name, config.generation);
  return config.generation;
}

/**
 * Return a runtime's agent-frontmatter tool dialect (canonical token -> runtime token
 * override map), or null when the runtime does not diverge from the canonical vocabulary
 * and therefore declares none. An empty map is a real declaration meaning identity.
 *
 */
function getAgentToolDialect(runtime: { agentToolDialect?: ToolDialect }): ToolDialect | null {
  return Object.prototype.hasOwnProperty.call(runtime, 'agentToolDialect')
    ? runtime.agentToolDialect ?? null
    : null;
}

/**
 * Resolve one already-enumerated runtime config by name (no directory scan). The
 * generator's enumeration entry point (src/tooling/generate.ts:loadRuntimes) remains the
 * single discovery pass; this accessor resolves a runtime the generator already knows.
 *
 */
function resolveRuntimeConfigPath(name: string, srcDir: string): string | null {
  const sourceConfigPath = path.join(srcDir, 'platforms', name, 'runtime-config.js');
  if (fs.existsSync(sourceConfigPath)) {
    return sourceConfigPath;
  }

  const compiledConfigPath = path.join(
    path.dirname(srcDir),
    'dist',
    'src',
    'platforms',
    name,
    'runtime-config.js'
  );
  if (fs.existsSync(compiledConfigPath)) {
    return compiledConfigPath;
  }

  return null;
}

async function getRuntimeConfig<T extends RuntimeConfig = RuntimeConfig>(name: string, srcDir: string): Promise<T> {
  const configPath = resolveRuntimeConfigPath(name, srcDir);
  if (!configPath) {
    throw new Error(`Unknown runtime "${name}": no config under ${srcDir}`);
  }
  const { default: config } = await import(pathToFileURL(configPath).href) as { default: T };
  return config;
}

export { assertValidRuntimeGeneration, getRuntimeGeneration, getAgentToolDialect, getRuntimeConfig };
