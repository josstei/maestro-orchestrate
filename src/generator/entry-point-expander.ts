import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { moduleDirname } from '../core/module-path.js';
import { toTitleCase } from '../lib/naming/index.js';
import { emitInlineQuotedList } from '../lib/yaml-emit.js';
import { getRuntimeConfig, getRuntimeGeneration } from '../platforms/runtime-descriptor.js';
import type { RuntimeName } from '../platforms/runtime-descriptor.js';
import type { EntryPointRegistryEntry, GeneratedOutput, StringMap } from './types.js';
const DEFAULT_SRC = path.resolve(moduleDirname(import.meta.url), '..');

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
function getEntryPointRuntimeName(entry: EntryPointRegistryEntry, runtimeName: string): string {
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

function runTemplateExpansion({
  runtimeName,
  registry,
  templatePath,
  outputPathFn,
  buildSubstitutions,
}: {
  runtimeName: string;
  registry: EntryPointRegistryEntry[];
  templatePath: string;
  outputPathFn: (entry: EntryPointRegistryEntry) => string;
  buildSubstitutions: (entry: EntryPointRegistryEntry) => StringMap;
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
 * @param {string} runtimeName
 * @param {string} [srcDir] Content root for registries and templates.
 * @param {string} [codeSrcDir] Executable module root for compiled helpers and runtime configs.
 * @returns {Array<{ outputPath: string, content: string }>}
 */
async function expandEntryPoints(
  runtimeName: string,
  srcDir = DEFAULT_SRC,
  codeSrcDir = DEFAULT_SRC
): Promise<GeneratedOutput[]> {
  const config = getRuntimeGeneration(await getRuntimeConfig(runtimeName, codeSrcDir)).entryPoint;
  if (!config) return [];

  const { default: registry } = await import(pathToFileURL(path.join(codeSrcDir, 'entry-points', 'registry.js')).href) as {
    default: EntryPointRegistryEntry[];
  };
  const preambleBuilders = await import(pathToFileURL(path.join(codeSrcDir, 'entry-points', 'preamble-builders.js')).href);
  const templatePath = path.join(srcDir, 'entry-points', 'templates', config.templateFile);
  const buildPreamble = preambleBuilders[runtimeName];

  return runTemplateExpansion({
    runtimeName,
    registry,
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
 * @param {string} runtimeName
 * @param {string} [srcDir] Content root for registries and templates.
 * @param {string} [codeSrcDir] Executable module root for compiled helpers and runtime configs.
 * @returns {Array<{ outputPath: string, content: string }>}
 */
async function expandCoreCommands(
  runtimeName: string,
  srcDir = DEFAULT_SRC,
  codeSrcDir = DEFAULT_SRC
): Promise<GeneratedOutput[]> {
  const config = getRuntimeGeneration(await getRuntimeConfig(runtimeName, codeSrcDir)).coreCommand;
  if (!config) return [];

  const { default: registry } = await import(pathToFileURL(path.join(codeSrcDir, 'entry-points', 'core-command-registry.js')).href) as {
    default: EntryPointRegistryEntry[];
  };
  const templatePath = path.join(srcDir, 'entry-points', 'templates', config.templateFile);

  return runTemplateExpansion({
    runtimeName,
    registry,
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
