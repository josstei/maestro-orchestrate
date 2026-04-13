'use strict';

const path = require('node:path');
const { parse } = require('../lib/frontmatter');
const { toPascalCase } = require('../lib/naming');
const { writeIfChanged } = require('../lib/io');
const { discover } = require('../lib/discovery');

/**
 * @typedef {Object} AgentEntry
 * @property {string} name
 * @property {string} capabilities
 * @property {string[]} tools
 */

/**
 * @typedef {Object<string, string>} ResourceRegistry
 */

/**
 * @typedef {Object} HookEntry
 * @property {string} module
 * @property {string} fn
 */

/**
 * @typedef {Object<string, HookEntry>} HookRegistry
 */

/**
 * Scan agent Markdown files and extract name, capabilities, and tools from
 * frontmatter. Returns a sorted array of agent entries.
 * @param {string} srcDir - Absolute path to the src/ directory
 * @returns {AgentEntry[]}
 */
function scanAgents(srcDir) {
  const entries = discover({
    dir: path.join(srcDir, 'agents'),
    pattern: '*.md',
    identity: (filepath) => path.basename(filepath, '.md'),
    metadata: (filepath, content) => {
      const { frontmatter } = parse(content);
      const name = frontmatter.name || path.basename(filepath, '.md');
      const capabilities = frontmatter.capabilities || 'read_only';
      const rawTools = frontmatter.tools || [];
      const tools = Array.isArray(rawTools) ? rawTools : [rawTools];
      return { name, capabilities, tools };
    },
  });

  return entries.map(({ name, capabilities, tools }) => ({ name, capabilities, tools }));
}

/**
 * Scan skills, templates, references, and protocol directories to build a
 * resource allowlist mapping resource identifiers to their source-relative
 * paths.
 * @param {string} srcDir - Absolute path to the src/ directory
 * @returns {ResourceRegistry}
 */
function scanResources(srcDir) {
  const skillsParentDir = path.join(srcDir, 'skills');

  const skillEntries = discover({
    dir: path.join(srcDir, 'skills', 'shared'),
    pattern: '**/*.md',
    identity: (filepath) => {
      if (path.basename(filepath) === 'SKILL.md') {
        return path.basename(path.dirname(filepath));
      }
      return path.basename(filepath, '.md');
    },
    metadata: (filepath) => {
      const relativePath = 'skills/' + path.relative(skillsParentDir, filepath)
        .split(path.sep)
        .join('/');
      return { relativePath };
    },
  });

  const templateEntries = discover({
    dir: path.join(srcDir, 'templates'),
    pattern: '*.md',
    identity: (filepath) => path.basename(filepath, '.md'),
    metadata: (filepath) => ({
      relativePath: `templates/${path.basename(filepath)}`,
    }),
  });

  const referenceEntries = discover({
    dir: path.join(srcDir, 'references'),
    pattern: '*.md',
    identity: (filepath) => path.basename(filepath, '.md'),
    metadata: (filepath) => ({
      relativePath: `references/${path.basename(filepath)}`,
    }),
  });

  const registry = {};
  for (const entry of [...skillEntries, ...templateEntries, ...referenceEntries]) {
    registry[entry.id] = entry.relativePath;
  }

  return registry;
}

/**
 * Scan hook logic files and build a hook registry mapping hook names to
 * their module paths and exported function names.
 * @param {string} srcDir - Absolute path to the src/ directory
 * @returns {HookRegistry}
 */
function scanHooks(srcDir) {
  const entries = discover({
    dir: path.join(srcDir, 'hooks', 'logic'),
    pattern: '*-logic.js',
    identity: (filepath) => path.basename(filepath).replace(/-logic\.js$/, ''),
    metadata: (filepath) => {
      const file = path.basename(filepath);
      const hookName = file.replace(/-logic\.js$/, '');
      return {
        module: `hooks/logic/${file}`,
        fn: `handle${toPascalCase(hookName)}`,
      };
    },
  });

  const registry = {};
  for (const entry of entries) {
    registry[entry.id] = { module: entry.module, fn: entry.fn };
  }

  return registry;
}

/**
 * Run all scanners and write the resulting JSON registry files to
 * src/generated/.
 * @param {string} srcDir - Absolute path to the src/ directory
 */
function generateRegistries(srcDir) {
  const generatedDir = path.join(srcDir, 'generated');

  const agents = scanAgents(srcDir);
  const resources = scanResources(srcDir);
  const hooks = scanHooks(srcDir);

  writeIfChanged(
    path.join(generatedDir, 'agent-registry.json'),
    JSON.stringify(agents, null, 2) + '\n'
  );
  writeIfChanged(
    path.join(generatedDir, 'resource-registry.json'),
    JSON.stringify(resources, null, 2) + '\n'
  );
  writeIfChanged(
    path.join(generatedDir, 'hook-registry.json'),
    JSON.stringify(hooks, null, 2) + '\n'
  );
}

module.exports = {
  scanAgents,
  scanResources,
  scanHooks,
  generateRegistries,
};
