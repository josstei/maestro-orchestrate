'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { toTitleCase } = require('../lib/naming');
const { emitInlineQuotedList } = require('../lib/yaml-emit');
const entryPointRegistry = require('../entry-points/registry');
const coreCommandRegistry = require('../entry-points/core-command-registry');

const TEMPLATES_DIR = path.join(__dirname, '..', 'entry-points', 'templates');

/**
 * Host command names that must never appear as public skill names. Claude
 * /review shadows the built-in PR review command and Codex review, debug and
 * resume conflict with built-ins; Antigravity has a built-in /resume; Claude
 * debug and resume and Antigravity review and debug are reserved defensively.
 */
const HOST_RESERVED_NAMES = new Set(['review', 'debug', 'resume']);

/**
 * The entry surfaces a runtime config's `entrySurface` may name. Each gives
 * its templates' format, the template each expansion kind renders
 * (`<runtime>-<template>.<ext>.tmpl`), and where its outputs go under
 * outputDir. Skills share the host's command namespace, so they take an
 * entry's `skillName` and must avoid HOST_RESERVED_NAMES; commands are
 * namespaced as /maestro:<name>.
 */
const SURFACES = {
  skill: {
    ext: 'md',
    templates: { 'entry-point': 'skill', 'core-command': 'core-command' },
    dir: 'skills',
    file: (name) => `${name}/SKILL.md`,
    hostNamespace: true,
  },
  command: {
    ext: 'toml',
    templates: { 'entry-point': 'command', 'core-command': 'core-command' },
    dir: 'commands',
    file: (name) => `maestro/${name}.toml`,
  },
};

/**
 * The skill-content line, then, for an entry with agents, the get_agent line
 * on runtimes with `entryAgentRefs` and the runtime's delegation note.
 */
function buildPreamble(entry, runtime, delegationNote) {
  const hasAgents = entry.agents.length > 0;
  const resources = ['architecture', ...(hasAgents ? ['delegation'] : []), ...(entry.skills || [])];
  const lines = [`Call \`get_skill_content\` with resources: [${emitInlineQuotedList(resources)}].`];
  if (hasAgents && runtime.entryAgentRefs) {
    lines.push(`Call \`get_agent\` with agents: [${emitInlineQuotedList(entry.agents)}].`);
  }
  if (hasAgents && delegationNote) lines.push(delegationNote);
  return lines.join('\n');
}

/**
 * Expansion kinds: the registry each renders and the template placeholder
 * values for one registry entry, given its runtime-resolved name and the
 * runtime's partials.
 */
const KINDS = {
  'entry-point': {
    registry: entryPointRegistry,
    substitutions: (entry, runtime, partials) => ({
      name: entry.name,
      title: entry.title || toTitleCase(entry.name),
      description: entry.description,
      workflowNumbered: entry.workflow.map((step, i) => `${i + 1}. ${step}`).join('\n'),
      constraintsList: (entry.constraints || []).map((c) => `- ${c}`).join('\n'),
      preamble: buildPreamble(entry, runtime, partials.delegationNote),
    }),
  },
  'core-command': {
    registry: coreCommandRegistry,
    substitutions: (entry, runtime, partials) => ({
      name: entry.name,
      description: entry.description,
      firstLine: entry.firstLine,
      requestType: entry.requestType,
      executeInstructions: entry.executeInstructions,
      preloadList: emitInlineQuotedList(entry.preload),
      sessionStateBlock: entry.injectSessionState && partials.sessionState ? `${partials.sessionState}\n\n` : '',
    }),
  },
};

/** The runtime's `<runtime>-<name>.<ext>.tmpl`, or null when it has none. */
function readTemplate(runtimeName, surface, name) {
  const templatePath = path.join(TEMPLATES_DIR, `${runtimeName}-${name}.${surface.ext}.tmpl`);
  return fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : null;
}

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
 * @param {object} runtime - Runtime config
 * @returns {Array<{ outputPath: string, content: string }>}
 * @throws {Error} For an unknown entry surface, a runtime without templates,
 *   or a resolved name that collides with a reserved host command
 */
function expand(kind, runtime) {
  const runtimeName = runtime.name;
  const { registry, substitutions } = KINDS[kind];
  const surface = SURFACES[runtime.entrySurface];
  if (!surface) throw new Error(`Unknown entry surface for ${runtimeName}: "${runtime.entrySurface}"`);
  const template = readTemplate(runtimeName, surface, surface.templates[kind]);
  if (template === null) {
    throw new Error(`Unknown runtime for ${kind} expansion: "${runtimeName}"`);
  }
  // Optional partials, stored with a final newline that the output omits.
  const partials = {
    delegationNote: readTemplate(runtimeName, surface, 'delegation-note')?.trimEnd(),
    sessionState: readTemplate(runtimeName, surface, 'session-state')?.trimEnd(),
  };
  // Runtime-config values every template of the runtime may render.
  const runtimeSubstitutions = {
    mcpPrefix: runtime.mcpPrefix,
    agentDispatch: runtime.delegation.pattern.replace('{{agent}}', '<name>'),
  };
  return registry.map((entry) => {
    const runtimeEntry = {
      ...entry,
      name: (surface.hostNamespace && entry.skillName) || entry.name,
    };
    if (surface.hostNamespace && HOST_RESERVED_NAMES.has(runtimeEntry.name)) {
      throw new Error(
        `Reserved ${runtimeName} host command name "${runtimeEntry.name}" conflicts with a built-in — ` +
        'add a skillName to the registry entry to remap it'
      );
    }
    return {
      outputPath: path.posix.join(runtime.outputDir, surface.dir, surface.file(runtimeEntry.name)),
      content: applySubstitutions(template, {
        ...runtimeSubstitutions,
        ...substitutions(runtimeEntry, runtime, partials),
      }),
    };
  });
}

/**
 * @param {object} runtime - Runtime config
 * @returns {string} The directory, relative to the repo root, that holds the
 *   runtime's entry-point and core-command outputs
 */
function entrySurfaceDir(runtime) {
  return path.posix.join(runtime.outputDir, SURFACES[runtime.entrySurface].dir);
}

/**
 * @param {object} runtime - Runtime config
 * @returns {Array<{ outputPath: string, content: string }>}
 */
function expandEntryPoints(runtime) {
  return expand('entry-point', runtime);
}

/**
 * @param {object} runtime - Runtime config
 * @returns {Array<{ outputPath: string, content: string }>}
 */
function expandCoreCommands(runtime) {
  return expand('core-command', runtime);
}

module.exports = { entrySurfaceDir, expandEntryPoints, expandCoreCommands };
