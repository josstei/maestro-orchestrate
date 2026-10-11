'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { toTitleCase } = require('../lib/naming');
const { emitInlineQuotedList } = require('../lib/yaml-emit');

const DEFAULT_SRC = path.resolve(__dirname, '..');

/**
 * Host command names that must never appear as public skill names. Claude
 * /review shadows the built-in PR review command and Codex review, debug and
 * resume conflict with built-ins; Claude debug and resume are reserved
 * defensively.
 */
const HOST_RESERVED_NAMES = new Set(['review', 'debug', 'resume']);

/**
 * Per-runtime entry-point surface. Entry points and core commands share one
 * output location per runtime; Qwen reuses Gemini's commands and emits none.
 */
const RUNTIME_ENTRY_POINTS = {
  gemini: {
    outputPath: (e) => `commands/maestro/${e.name}.toml`,
    entryTemplate: 'gemini-command.toml.tmpl',
    preamblePlaceholder: 'skills_block',
    coreTemplate: 'gemini-core-command.toml.tmpl',
    reservedNames: null,
  },
  claude: {
    outputPath: (e) => `claude/skills/${e.name}/SKILL.md`,
    entryTemplate: 'claude-skill.md.tmpl',
    preamblePlaceholder: 'protocol_block',
    coreTemplate: 'claude-core-command.md.tmpl',
    reservedNames: HOST_RESERVED_NAMES,
  },
  codex: {
    outputPath: (e) => `plugins/maestro/skills/${e.name}/SKILL.md`,
    entryTemplate: 'codex-skill.md.tmpl',
    preamblePlaceholder: 'refs_list',
    coreTemplate: 'codex-core-command.md.tmpl',
    reservedNames: HOST_RESERVED_NAMES,
  },
  qwen: null,
};

const GEMINI_SESSION_STATE_BLOCK = `The current session state is provided below:

<session-state>
!{extension_root="\${MAESTRO_EXTENSION_PATH:-$HOME/.gemini/extensions/maestro}"; script="$extension_root/src/scripts/read-active-session.js"; if [[ -f "$script" ]]; then node "$script"; else echo "No active session"; fi}
</session-state>

Use the injected session state above as the source of truth for resume position.

`;

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
 * @param {Set<string>|null} reservedNames
 * @throws {Error}
 */
function assertNotHostReserved(resolvedName, runtimeName, reservedNames) {
  if (reservedNames && reservedNames.has(resolvedName)) {
    throw new Error(
      `Reserved ${runtimeName} host command name "${resolvedName}" conflicts with a built-in — ` +
      'add a runtimeNames entry to the registry to remap it'
    );
  }
}

function applySubstitutions(template, substitutions) {
  let content = template;
  for (const [key, value] of Object.entries(substitutions)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}

function runTemplateExpansion({ runtimeName, config, registry, srcDir, templateFile, buildSubstitutions }) {
  const templatePath = path.join(srcDir, 'entry-points', 'templates', templateFile);
  const template = fs.readFileSync(templatePath, 'utf8');
  return registry.map((entry) => {
    const runtimeEntry = {
      ...entry,
      name: getEntryPointRuntimeName(entry, runtimeName),
    };
    assertNotHostReserved(runtimeEntry.name, runtimeName, config.reservedNames);
    return {
      outputPath: config.outputPath(runtimeEntry),
      content: applySubstitutions(template, buildSubstitutions(runtimeEntry)),
    };
  });
}

function resolveRuntimeEntryPoints(runtimeName, kind) {
  const config = RUNTIME_ENTRY_POINTS[runtimeName];
  if (config === undefined) {
    throw new Error(`Unknown runtime for ${kind} expansion: "${runtimeName}"`);
  }
  return config;
}

/**
 * @param {string} runtimeName
 * @param {string} [srcDir]
 * @returns {Array<{ outputPath: string, content: string }>}
 */
function expandEntryPoints(runtimeName, srcDir = DEFAULT_SRC) {
  const config = resolveRuntimeEntryPoints(runtimeName, 'entry-point');
  if (!config) return [];

  const registry = require(path.join(srcDir, 'entry-points', 'registry'));
  const preambleBuilders = require(path.join(srcDir, 'entry-points', 'preamble-builders'));
  const buildPreamble = preambleBuilders[runtimeName];

  return runTemplateExpansion({
    runtimeName,
    config,
    registry,
    srcDir,
    templateFile: config.entryTemplate,
    buildSubstitutions: (runtimeEntry) => ({
      name: runtimeEntry.name,
      Name: toTitleCase(runtimeEntry.name),
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
  const config = resolveRuntimeEntryPoints(runtimeName, 'core-command');
  if (!config) return [];

  const registry = require(path.join(srcDir, 'entry-points', 'core-command-registry'));

  return runTemplateExpansion({
    runtimeName,
    config,
    registry,
    srcDir,
    templateFile: config.coreTemplate,
    buildSubstitutions: (runtimeEntry) => ({
      name: runtimeEntry.name,
      description: runtimeEntry.description,
      firstLine: runtimeEntry.firstLine,
      requestType: runtimeEntry.requestType,
      executeInstructions: runtimeEntry.executeInstructions,
      preloadList: emitInlineQuotedList(runtimeEntry.preload),
      sessionStateBlock: runtimeEntry.geminiSessionStateInjection ? GEMINI_SESSION_STATE_BLOCK : '',
    }),
  });
}

module.exports = { expandEntryPoints, expandCoreCommands };
