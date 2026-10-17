'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { toTitleCase } = require('../lib/naming');
const { emitInlineQuotedList } = require('../lib/yaml-emit');
const entryPointRegistry = require('../entry-points/registry');
const coreCommandRegistry = require('../entry-points/core-command-registry');
const preambleBuilders = require('../entry-points/preamble-builders');

const TEMPLATES_DIR = path.join(__dirname, '..', 'entry-points', 'templates');

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
    templates: {
      'entry-point': 'gemini-command.toml.tmpl',
      'core-command': 'gemini-core-command.toml.tmpl',
    },
    reservedNames: null,
  },
  claude: {
    outputPath: (e) => `claude/skills/${e.name}/SKILL.md`,
    templates: {
      'entry-point': 'claude-skill.md.tmpl',
      'core-command': 'claude-core-command.md.tmpl',
    },
    reservedNames: HOST_RESERVED_NAMES,
  },
  codex: {
    outputPath: (e) => `plugins/maestro/skills/${e.name}/SKILL.md`,
    templates: {
      'entry-point': 'codex-skill.md.tmpl',
      'core-command': 'codex-core-command.md.tmpl',
    },
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
 * Expansion kinds: the registry each renders and the template placeholder
 * values for one registry entry, given its runtime-resolved name.
 */
const KINDS = {
  'entry-point': {
    registry: entryPointRegistry,
    substitutions: (entry, runtimeName) => ({
      name: entry.name,
      title: entry.title || toTitleCase(entry.name),
      description: entry.description,
      workflowNumbered: entry.workflow.map((step, i) => `${i + 1}. ${step}`).join('\n'),
      constraintsList: (entry.constraints || []).map((c) => `- ${c}`).join('\n'),
      preamble: preambleBuilders[runtimeName](entry),
    }),
  },
  'core-command': {
    registry: coreCommandRegistry,
    substitutions: (entry) => ({
      name: entry.name,
      description: entry.description,
      firstLine: entry.firstLine,
      requestType: entry.requestType,
      executeInstructions: entry.executeInstructions,
      preloadList: emitInlineQuotedList(entry.preload),
      sessionStateBlock: entry.geminiSessionStateInjection ? GEMINI_SESSION_STATE_BLOCK : '',
    }),
  },
};

function applySubstitutions(template, substitutions) {
  let content = template;
  for (const [key, value] of Object.entries(substitutions)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}

/**
 * Render every registry entry of one kind for one runtime.
 * @param {'entry-point'|'core-command'} kind
 * @param {string} runtimeName
 * @returns {Array<{ outputPath: string, content: string }>} Empty for a
 *   runtime that emits no entry points
 * @throws {Error} For an unknown runtime, or a resolved name that collides
 *   with a reserved host command
 */
function expand(kind, runtimeName) {
  const config = RUNTIME_ENTRY_POINTS[runtimeName];
  if (config === undefined) {
    throw new Error(`Unknown runtime for ${kind} expansion: "${runtimeName}"`);
  }
  if (!config) return [];

  const { registry, substitutions } = KINDS[kind];
  const template = fs.readFileSync(path.join(TEMPLATES_DIR, config.templates[kind]), 'utf8');
  return registry.map((entry) => {
    const runtimeEntry = {
      ...entry,
      name: entry.runtimeNames?.[runtimeName] || entry.name,
    };
    if (config.reservedNames && config.reservedNames.has(runtimeEntry.name)) {
      throw new Error(
        `Reserved ${runtimeName} host command name "${runtimeEntry.name}" conflicts with a built-in — ` +
        'add a runtimeNames entry to the registry to remap it'
      );
    }
    return {
      outputPath: config.outputPath(runtimeEntry),
      content: applySubstitutions(template, substitutions(runtimeEntry, runtimeName)),
    };
  });
}

/**
 * @param {string} runtimeName
 * @returns {Array<{ outputPath: string, content: string }>}
 */
function expandEntryPoints(runtimeName) {
  return expand('entry-point', runtimeName);
}

/**
 * @param {string} runtimeName
 * @returns {Array<{ outputPath: string, content: string }>}
 */
function expandCoreCommands(runtimeName) {
  return expand('core-command', runtimeName);
}

module.exports = { expandEntryPoints, expandCoreCommands };
