'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { toTitleCase } = require('../lib/naming');
const { RUNTIME_NAMES } = require('../platforms/runtime-config-map');
const entryPointRegistry = require('../entry-points/registry');
const coreCommandRegistry = require('../entry-points/core-command-registry');

const RUNTIMES_DIR = path.join(__dirname, 'runtimes');

/**
 * Render names as a comma-separated list of double-quoted strings, for the
 * `resources: [...]` and `agents: [...]` arguments in generated tool calls.
 * Names are not escaped: they are registry identifiers.
 * @param {string[]} items
 * @returns {string}
 */
function quotedList(items) {
  return items.map((item) => `"${item}"`).join(', ');
}

/**
 * Expansion kinds: the registry each renders and the template placeholder
 * values for one registry entry, given its runtime-resolved name and the
 * runtime's preamble builder for the kind. Entry-point preambles get the
 * entry's get_skill_content line and, when it has agents, its get_agent line.
 */
const KINDS = {
  'entry-point': {
    registry: entryPointRegistry,
    substitutions: (entry, preamble) => ({
      name: entry.name,
      title: entry.title || toTitleCase(entry.name),
      description: entry.description,
      workflowNumbered: entry.workflow.map((step, i) => `${i + 1}. ${step}`).join('\n'),
      constraintsList: entry.constraints.map((c) => `- ${c}`).join('\n'),
      preamble: preamble(entry, {
        skillContentLine: `Call \`get_skill_content\` with resources: [${quotedList(['architecture', ...entry.skills])}].`,
        agentLine: entry.agents.length > 0 ? `Call \`get_agent\` with agents: [${quotedList(entry.agents)}].` : null,
      }),
    }),
  },
  'core-command': {
    registry: coreCommandRegistry,
    substitutions: (entry, preamble) => ({
      name: entry.name,
      description: entry.description,
      firstLine: entry.firstLine,
      requestType: entry.requestType,
      executeInstructions: entry.executeInstructions,
      preloadList: quotedList(entry.preload),
      preamble: preamble(entry),
    }),
  },
};

/**
 * A runtime's template for one kind: runtimes/<runtime>/<kind>.<ext>.tmpl,
 * where <ext> is the format of the files it renders.
 */
function readTemplate(runtimeName, kind) {
  const runtimeDir = path.join(RUNTIMES_DIR, runtimeName);
  const file = fs.readdirSync(runtimeDir).find((name) => name.startsWith(`${kind}.`));
  return fs.readFileSync(path.join(runtimeDir, file), 'utf8');
}

/**
 * Fill each {{key}} placeholder that has a substitution, in one pass so no
 * value is rescanned; others (Qwen's {{args}}) stay for the host.
 */
function applySubstitutions(template, substitutions) {
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key) =>
    (Object.hasOwn(substitutions, key) ? substitutions[key] : placeholder));
}

/**
 * Render every registry entry of one kind for one runtime, through the
 * runtime's template and its runtimes/<runtime>/outputs.js `entryPoints`.
 * @param {'entry-point'|'core-command'} kind
 * @param {string} runtimeName
 * @returns {Array<{ outputPath: string, content: string }>}
 * @throws {Error} For an unknown runtime, or an entry that would render
 *   under a name the runtime reserves (no hostSafeName, or a reserved one)
 */
function expand(kind, runtimeName) {
  if (!RUNTIME_NAMES.includes(runtimeName)) {
    throw new Error(`Unknown runtime for ${kind} expansion: "${runtimeName}"`);
  }

  const { outputPath, reservedNames, preamble } = require(`./runtimes/${runtimeName}/outputs`).entryPoints;
  const { registry, substitutions } = KINDS[kind];
  const template = readTemplate(runtimeName, kind);
  return registry.map((entry) => {
    const name = reservedNames.includes(entry.name) && entry.hostSafeName ? entry.hostSafeName : entry.name;
    if (reservedNames.includes(name)) {
      throw new Error(
        `Reserved ${runtimeName} host command name "${name}" conflicts with a built-in — ` +
        'give the registry entry a hostSafeName the runtime does not reserve'
      );
    }
    const runtimeEntry = { ...entry, name };
    return {
      outputPath: outputPath(name),
      content: applySubstitutions(template, substitutions(runtimeEntry, preamble[kind])),
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
