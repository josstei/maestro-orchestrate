import path from 'node:path';
import fs from 'node:fs';
import { toTitleCase } from '../lib/naming/index.js';
import { emitInlineQuotedList } from '../lib/yaml-emit.js';
import { getRuntimeConfig, getRuntimeGeneration } from '../platforms/runtime-descriptor.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const DEFAULT_SRC = path.resolve(moduleDirname, '..');

// Host platform names that must never appear as public skill names.
// Confirmed: Claude /review shadows the built-in PR review command.
// Confirmed: Codex review, debug, resume conflict with built-in commands.
// Defensive: Claude debug and resume preemptively reserved.
const HOST_RESERVED_NAMES = {
  codex: new Set(['review', 'debug', 'resume']),
  claude: new Set(['review', 'debug', 'resume']),
};

/**
 * @param {{ name: string, runtimeNames?: Record<string, string> }} entry
 * @param {string} runtimeName
 * @returns {string}
 */
function getEntryPointRuntimeName(entry, runtimeName) {
  return entry.runtimeNames?.[runtimeName] || entry.name;
}

/**
 * @param {string} resolvedName
 * @param {string} runtimeName
 * @throws {Error}
 */
function assertNotHostReserved(resolvedName, runtimeName) {
  const reserved = HOST_RESERVED_NAMES[runtimeName];
  if (reserved && reserved.has(resolvedName)) {
    throw new Error(
      `Reserved ${runtimeName} host command name "${resolvedName}" conflicts with a built-in — ` +
      'add a runtimeNames entry to the registry to remap it'
    );
  }
}

function applySubstitutions(template, substitutions) {
  let content = template;
  for (const [key, value] of Object.entries(substitutions)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    content = content.replace(pattern, value);
  }
  return content;
}

function runTemplateExpansion({ runtimeName, registry, templatePath, outputPathFn, buildSubstitutions }) {
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
 * @param {string} [srcDir]
 * @returns {Array<{ outputPath: string, content: string }>}
 */
async function expandEntryPoints(runtimeName, srcDir = DEFAULT_SRC) {
  const config = getRuntimeGeneration(await getRuntimeConfig(runtimeName, srcDir)).entryPoint;
  if (!config) return [];

  const { default: registry } = await import(pathToFileURL(path.join(srcDir, 'entry-points', 'registry.js')).href);
  const preambleBuilders = await import(pathToFileURL(path.join(srcDir, 'entry-points', 'preamble-builders.js')).href);
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
      workflow_numbered: runtimeEntry.workflow.map((step, i) => `${i + 1}. ${step}`).join('\n'),
      constraints_list: (runtimeEntry.constraints || []).map((c) => `- ${c}`).join('\n'),
      [config.preamblePlaceholder]: buildPreamble(runtimeEntry),
    }),
  });
}

/**
 * @param {string} runtimeName
 * @param {string} [srcDir]
 * @returns {Array<{ outputPath: string, content: string }>}
 */
async function expandCoreCommands(runtimeName, srcDir = DEFAULT_SRC) {
  const config = getRuntimeGeneration(await getRuntimeConfig(runtimeName, srcDir)).coreCommand;
  if (!config) return [];

  const { default: registry } = await import(pathToFileURL(path.join(srcDir, 'entry-points', 'core-command-registry.js')).href);
  const templatePath = path.join(srcDir, 'entry-points', 'templates', config.templateFile);

  return runTemplateExpansion({
    runtimeName,
    registry,
    templatePath,
    outputPathFn: config.outputPath,
    buildSubstitutions: (runtimeEntry) => ({
      name: runtimeEntry.name,
      description: runtimeEntry.description,
      firstLine: runtimeEntry.firstLine,
      requestType: runtimeEntry.requestType,
      executeInstructions: runtimeEntry.executeInstructions,
      preloadList: emitInlineQuotedList(runtimeEntry.preload),
      sessionStateBlock: '',
    }),
  });
}

export { expandEntryPoints, expandCoreCommands };
