'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../core/frontmatter-parser');

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
  const agentsDir = path.join(srcDir, 'agents');
  const files = fs.readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  return files.map((file) => {
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    const { frontmatter } = parse(content);

    const name = frontmatter.name || path.basename(file, '.md');
    const capabilities = frontmatter.capabilities || 'read_only';

    const rawTools = frontmatter.tools || [];
    const tools = Array.isArray(rawTools) ? rawTools : [rawTools];

    return { name, capabilities, tools };
  });
}

/**
 * Scan skills, templates, references, and protocol directories to build a
 * resource allowlist mapping resource identifiers to their source-relative
 * paths.
 * @param {string} srcDir - Absolute path to the src/ directory
 * @returns {ResourceRegistry}
 */
function scanResources(srcDir) {
  const registry = {};

  const skillsDir = path.join(srcDir, 'skills', 'shared');
  if (fs.existsSync(skillsDir)) {
    walkSkills(skillsDir, skillsDir, registry);
  }

  const templatesDir = path.join(srcDir, 'templates');
  if (fs.existsSync(templatesDir)) {
    const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const key = path.basename(file, '.md');
      registry[key] = `templates/${file}`;
    }
  }

  const referencesDir = path.join(srcDir, 'references');
  if (fs.existsSync(referencesDir)) {
    const files = fs.readdirSync(referencesDir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const key = path.basename(file, '.md');
      registry[key] = `references/${file}`;
    }
  }

  return registry;
}

/**
 * Walk the shared skills directory tree recursively, registering SKILL.md
 * files by their parent directory name, and protocol .md files by their
 * filename stem.
 * @param {string} dir - Current directory to walk
 * @param {string} skillsRoot - Root of the skills/shared/ directory
 * @param {ResourceRegistry} registry - Mutable registry being built
 */
function walkSkills(dir, skillsRoot, registry) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkSkills(fullPath, skillsRoot, registry);
      continue;
    }

    if (!entry.name.endsWith('.md')) {
      continue;
    }

    const relativePath = 'skills/' + path.relative(path.dirname(skillsRoot), fullPath)
      .split(path.sep)
      .join('/');

    if (entry.name === 'SKILL.md') {
      const key = path.basename(dir);
      registry[key] = relativePath;
    } else {
      const key = path.basename(entry.name, '.md');
      registry[key] = relativePath;
    }
  }
}

/**
 * Derive a PascalCase handler function name from a hook name.
 *   "session-start" -> "handleSessionStart"
 * @param {string} hookName
 * @returns {string}
 */
function hookNameToFunctionName(hookName) {
  const pascal = hookName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `handle${pascal}`;
}

/**
 * Scan hook logic files and build a hook registry mapping hook names to
 * their module paths and exported function names.
 * @param {string} srcDir - Absolute path to the src/ directory
 * @returns {HookRegistry}
 */
function scanHooks(srcDir) {
  const logicDir = path.join(srcDir, 'hooks', 'logic');
  const files = fs.readdirSync(logicDir)
    .filter((f) => f.endsWith('-logic.js'))
    .sort();

  const registry = {};

  for (const file of files) {
    const hookName = file.replace(/-logic\.js$/, '');
    const fn = hookNameToFunctionName(hookName);
    registry[hookName] = {
      module: `hooks/logic/${file}`,
      fn,
    };
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
  fs.mkdirSync(generatedDir, { recursive: true });

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

/**
 * Write content to a file only when it differs from the existing content.
 * @param {string} filePath
 * @param {string} content
 */
function writeIfChanged(filePath, content) {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : null;

  if (existing !== content) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

module.exports = {
  scanAgents,
  scanResources,
  scanHooks,
  generateRegistries,
};
