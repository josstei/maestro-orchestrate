import type { AgentCapability } from '../core/agent-registry.js';
import type { AgentNaming, RuntimeConfig } from '../platforms/runtime-descriptor.js';

type StringMap = Record<string, string>;

interface GeneratedOutput {
  outputPath: string;
  content: string;
}

interface ManifestRule {
  src?: string;
  glob?: string;
  runtimes: string[];
  transforms: string[];
  outputName?: string;
  exclude?: string[];
}

interface ManifestEntry {
  src: string;
  transforms: string[];
  outputs: Record<string, string>;
}

interface RegistryEntryBase {
  name: string;
  runtimeNames?: Record<string, string>;
  description: string;
}

interface EntryPointRegistryEntry extends RegistryEntryBase {
  title?: string;
  agents?: string[];
  agent?: string;
  skills?: readonly string[];
  refs?: readonly string[];
  workflow: readonly string[];
  constraints?: readonly string[];
}

interface CoreCommandRegistryEntry extends RegistryEntryBase {
  firstLine: string;
  requestType: string;
  executeInstructions: string;
  preload?: readonly string[];
}

interface AgentRegistryEntry {
  name: string;
  capabilities: AgentCapability;
  tools: string[];
  focus: string;
}

interface HookRegistryEntry {
  module: string;
  fn: string;
}

interface RegistryModel {
  readonly agents: readonly AgentRegistryEntry[];
  readonly resources: Readonly<Record<string, string>>;
  readonly hooks: Readonly<Record<string, HookRegistryEntry>>;
}

interface RuntimeContextFileConfig {
  displayName: string;
  outputPath: string;
  subagentPrerequisite: string;
  extensionHome: string;
  extensionManifest: string;
  hooksConfigPath: string;
  includeToolMappingTable?: boolean;
  commandDir?: string;
  commandNamespace?: string;
  toolNames: {
    askUser: string;
    writeTodos: string;
    replace: string;
  };
}

interface RuntimeHookConfig {
  events: Record<string, string>;
  nameSuffix: string;
  descriptionSuffix: string;
}

type GeneratorRuntimeConfig = RuntimeConfig;

type GeneratorRuntimeMap = Record<string, GeneratorRuntimeConfig>;

interface PackageMetadata {
  version: string;
}

interface FileWriterStats {
  written: number;
  unchanged: number;
  errors: number;
}

interface FileWriter {
  write(outputPath: string, content: string): void;
  clean(outputPaths: string[]): void;
  getStats(): FileWriterStats;
}

interface GenerationSessionOptions {
  rootDir: string;
  dryRun?: boolean;
  diffMode?: boolean;
  quiet?: boolean;
}

export type {
  AgentNaming,
  AgentRegistryEntry,
  CoreCommandRegistryEntry,
  EntryPointRegistryEntry,
  FileWriter,
  FileWriterStats,
  GeneratedOutput,
  GenerationSessionOptions,
  GeneratorRuntimeConfig,
  GeneratorRuntimeMap,
  HookRegistryEntry,
  ManifestEntry,
  ManifestRule,
  PackageMetadata,
  RegistryModel,
  RuntimeContextFileConfig,
  RuntimeHookConfig,
  StringMap,
};
