'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { toTitleCase } = require('../lib/naming');
const { emitInlineQuotedList } = require('../lib/yaml-emit');

const DEFAULT_SRC = path.resolve(__dirname, '..');

// Host platform names that must never appear as public skill names.
// Confirmed: Claude /review shadows the built-in PR review command.
// Confirmed: Codex review, debug, resume conflict with built-in commands.
// Defensive: Claude debug and resume preemptively reserved.
const HOST_RESERVED_NAMES = {
  codex: new Set(['review', 'debug', 'resume']),
  claude: new Set(['review', 'debug', 'resume']),
};

// Entry points and core commands share one output location per runtime.
const OUTPUT_PATHS = {
  gemini: (e) => `commands/maestro/${e.name}.toml`,
  claude: (e) => `claude/skills/${e.name}/SKILL.md`,
  codex: (e) => `plugins/maestro/skills/${e.name}/SKILL.md`,
};

const ENTRY_POINT_CONFIG = {
  gemini: { templateFile: 'gemini-command.toml.tmpl', preamblePlaceholder: 'skills_block' },
  claude: { templateFile: 'claude-skill.md.tmpl', preamblePlaceholder: 'protocol_block' },
  codex: { templateFile: 'codex-skill.md.tmpl', preamblePlaceholder: 'refs_list' },
  qwen: null,
};

const CORE_COMMAND_CONFIG = {
  gemini: { templateFile: 'gemini-core-command.toml.tmpl' },
  claude: { templateFile: 'claude-core-command.md.tmpl' },
  codex: { templateFile: 'codex-core-command.md.tmpl' },
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
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}

function runTemplateExpansion({ runtimeName, registry, srcDir, templateFile, buildSubstitutions }) {
  const templatePath = path.join(srcDir, 'entry-points', 'templates', templateFile);
  const template = fs.readFileSync(templatePath, 'utf8');
  const outputPathFn = OUTPUT_PATHS[runtimeName];
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

function resolveRuntimeConfig(configMap, runtimeName, kind) {
  const config = configMap[runtimeName];
  if (config === null) return null;
  if (!config) {
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
  const config = resolveRuntimeConfig(ENTRY_POINT_CONFIG, runtimeName, 'entry-point');
  if (!config) return [];

  const registry = require(path.join(srcDir, 'entry-points', 'registry'));
  const preambleBuilders = require(path.join(srcDir, 'entry-points', 'preamble-builders'));
  const buildPreamble = preambleBuilders[runtimeName];

  return runTemplateExpansion({
    runtimeName,
    registry,
    srcDir,
    templateFile: config.templateFile,
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
  const config = resolveRuntimeConfig(CORE_COMMAND_CONFIG, runtimeName, 'core-command');
  if (!config) return [];

  const registry = require(path.join(srcDir, 'entry-points', 'core-command-registry'));

  return runTemplateExpansion({
    runtimeName,
    registry,
    srcDir,
    templateFile: config.templateFile,
    buildSubstitutions: (runtimeEntry) => ({
      name: runtimeEntry.name,
      description: runtimeEntry.description,
      firstLine: runtimeEntry.firstLine,
      requestType: runtimeEntry.requestType,
      executeInstructions: runtimeEntry.executeInstructions,
      preloadList: emitInlineQuotedList(runtimeEntry.preload),
      sessionStateBlock: (runtimeName === 'gemini' && runtimeEntry.geminiSessionStateInjection)
        ? GEMINI_SESSION_STATE_BLOCK
        : '',
    }),
  });
}

module.exports = { expandEntryPoints, expandCoreCommands };
