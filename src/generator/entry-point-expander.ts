import path from 'node:path';
import fs from 'node:fs';
import { moduleDirname } from '../core/package-root.js';
import coreCommands from '../entry-points/core-command-registry.js';
import * as preambleBuilders from '../entry-points/preamble-builders.js';
import entryPoints from '../entry-points/registry.js';
import { toTitleCase } from '../lib/naming/index.js';
import { emitInlineQuotedList } from '../lib/yaml-emit.js';
import { getRuntimeDefinition } from '../platforms/runtime-declarations.js';
import type { RuntimeDefinition } from '../platforms/runtime-declarations.js';
import { getRuntimeGeneration } from '../platforms/runtime-descriptor.js';
import type { RuntimeName } from '../platforms/runtime-descriptor.js';
import type { CoreCommandRegistryEntry, EntryPointRegistryEntry, GeneratedOutput, StringMap } from './types.js';
const DEFAULT_SRC = path.resolve(moduleDirname(import.meta.url), '..');

interface RuntimeNamedRegistryEntry {
  name: string;
  runtimeNames?: Record<string, string>;
}

// Host platform names that must never appear as public skill names.
// Confirmed: Claude /review shadows the built-in PR review command.
// Confirmed: Codex review, debug, resume conflict with built-in commands.
// Defensive: Claude debug and resume preemptively reserved.
const HOST_RESERVED_NAMES: Partial<Record<RuntimeName, Set<string>>> = {
  codex: new Set(['review', 'debug', 'resume']),
  claude: new Set(['review', 'debug', 'resume']),
};

/**
 * @param {{ name: string, runtimeNames?: Record<string, string> }} entry
 * @param {string} runtimeName
 * @returns {string}
 */
function getEntryPointRuntimeName(entry: RuntimeNamedRegistryEntry, runtimeName: string): string {
  return entry.runtimeNames?.[runtimeName] || entry.name;
}

/**
 * @param {string} resolvedName
 * @param {string} runtimeName
 * @throws {Error}
 */
function assertNotHostReserved(resolvedName: string, runtimeName: string): void {
  const reserved = HOST_RESERVED_NAMES[runtimeName as RuntimeName];
  if (reserved && reserved.has(resolvedName)) {
    throw new Error(
      `Reserved ${runtimeName} host command name "${resolvedName}" conflicts with a built-in — ` +
      'add a runtimeNames entry to the registry to remap it'
    );
  }
}

function applySubstitutions(template: string, substitutions: StringMap): string {
  let content = template;
  for (const [key, value] of Object.entries(substitutions)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    content = content.replace(pattern, value);
  }
  return content;
}

function resolveRuntimeDefinition(runtime: RuntimeDefinition | string): RuntimeDefinition {
  if (typeof runtime !== 'string') return runtime;

  const definition = getRuntimeDefinition(runtime);
  if (!definition) {
    throw new Error(`Unknown runtime "${runtime}"`);
  }
  return definition;
}

function runTemplateExpansion<TEntry extends RuntimeNamedRegistryEntry>({
  runtimeName,
  registry,
  templatePath,
  outputPathFn,
  buildSubstitutions,
}: {
  runtimeName: string;
  registry: readonly TEntry[];
  templatePath: string;
  outputPathFn: (entry: TEntry) => string;
  buildSubstitutions: (entry: TEntry) => StringMap;
}): GeneratedOutput[] {
  const template = fs.readFileSync(templatePath, 'utf8');
  return registry.map((entry) => {
    const runtimeEntry = {
      ...entry,
      name: getEntryPointRuntimeName(entry, runtimeName),
    };
    assertNotHostReserved(runtimeEntry.name, runtimeName);
    return {
      outputPath: outputPathFn(runtimeEntry),
      content: applySubstitutions(template, buildSubstitutions(runtimeEntry)),
    };
  });
}

/**
 * @param {RuntimeDefinition | string} runtime
 * @param {string} [srcDir] Content root for registries and templates.
 * @param {string} [codeSrcDir] Legacy executable root retained for call compatibility; ignored.
 * @returns {Array<{ outputPath: string, content: string }>}
 */
async function expandEntryPoints(
  runtime: RuntimeDefinition | string,
  srcDir = DEFAULT_SRC,
  codeSrcDir?: string
): Promise<GeneratedOutput[]> {
  const definition = resolveRuntimeDefinition(runtime);
  const runtimeName = definition.name;
  const config = getRuntimeGeneration(definition.config).entryPoint;
  if (!config) return [];

  const templatePath = path.join(srcDir, 'entry-points', 'templates', config.templateFile);
  const buildPreamble = preambleBuilders[runtimeName as keyof typeof preambleBuilders];

  return runTemplateExpansion<EntryPointRegistryEntry>({
    runtimeName,
    registry: entryPoints,
    templatePath,
    outputPathFn: config.outputPath,
    buildSubstitutions: (runtimeEntry) => ({
      name: runtimeEntry.name,
      Name: runtimeEntry.title || toTitleCase(runtimeEntry.name),
      description: runtimeEntry.description,
      workflow_numbered: runtimeEntry.workflow.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n'),
      constraints_list: (runtimeEntry.constraints || []).map((c) => `- ${c}`).join('\n'),
      [config.preamblePlaceholder]: buildPreamble(runtimeEntry),
    }),
  });
}

/**
 * @param {RuntimeDefinition | string} runtime
 * @param {string} [srcDir] Content root for registries and templates.
 * @param {string} [codeSrcDir] Legacy executable root retained for call compatibility; ignored.
 * @returns {Array<{ outputPath: string, content: string }>}
 */
async function expandCoreCommands(
  runtime: RuntimeDefinition | string,
  srcDir = DEFAULT_SRC,
  codeSrcDir?: string
): Promise<GeneratedOutput[]> {
  const definition = resolveRuntimeDefinition(runtime);
  const runtimeName = definition.name;
  const config = getRuntimeGeneration(definition.config).coreCommand;
  if (!config) return [];

  const templatePath = path.join(srcDir, 'entry-points', 'templates', config.templateFile);

  return runTemplateExpansion<CoreCommandRegistryEntry>({
    runtimeName,
    registry: coreCommands,
    templatePath,
    outputPathFn: config.outputPath,
    buildSubstitutions: (runtimeEntry) => ({
      name: runtimeEntry.name,
      description: runtimeEntry.description,
      firstLine: runtimeEntry.firstLine || '',
      requestType: runtimeEntry.requestType || '',
      executeInstructions: runtimeEntry.executeInstructions || '',
      preloadList: emitInlineQuotedList(runtimeEntry.preload || []),
      sessionStateBlock: '',
    }),
  });
}

export { expandEntryPoints, expandCoreCommands };
