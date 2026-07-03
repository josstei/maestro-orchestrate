'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { toTitleCase } = require('../lib/naming');
const { emitInlineQuotedList } = require('../lib/yaml-emit');
const { getRuntimeConfig, getRuntimeGeneration } = require('../platforms/runtime-descriptor');

const DEFAULT_SRC = path.resolve(__dirname, '..');

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
function expandEntryPoints(runtimeName, srcDir = DEFAULT_SRC) {
  const config = getRuntimeGeneration(getRuntimeConfig(runtimeName, srcDir)).entryPoint;
  if (!config) return [];

  const registry = require(path.join(srcDir, 'entry-points', 'registry'));
  const preambleBuilders = require(path.join(srcDir, 'entry-points', 'preamble-builders'));
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
function expandCoreCommands(runtimeName, srcDir = DEFAULT_SRC) {
  const config = getRuntimeGeneration(getRuntimeConfig(runtimeName, srcDir)).coreCommand;
  if (!config) return [];

  const registry = require(path.join(srcDir, 'entry-points', 'core-command-registry'));
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

module.exports = { expandEntryPoints, expandCoreCommands };
