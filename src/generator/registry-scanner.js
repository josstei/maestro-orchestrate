'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { discover, generateRegistry } = require('../lib/discovery');
const { serializeRegistry } = require('../lib/discovery');
const { parse } = require('../lib/frontmatter');
const { toPascalCase } = require('../lib/naming');

function buildAgentRegistry(srcDir) {
  const agentEntries = discover({
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

  return agentEntries.map(({ name, capabilities, tools }) => ({ name, capabilities, tools }));
}

function buildResourceRegistry(srcDir) {
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

  // Config-rendered references: *.config.js files produce resources with the
  // same ID as their basename (minus .config.js).  The resource registry still
  // maps the ID to the .md path for backwards compatibility — the runtime
  // content provider detects the config and renders on the fly.
  const configRenderedEntries = discover({
    dir: path.join(srcDir, 'references'),
    pattern: '*.config.js',
    identity: (filepath) => path.basename(filepath, '.config.js'),
    metadata: (filepath) => ({
      relativePath: `references/${path.basename(filepath, '.config.js')}.md`,
    }),
  });

  const resources = {};
  for (const entry of [...skillEntries, ...templateEntries, ...referenceEntries, ...configRenderedEntries]) {
    resources[entry.id] = entry.relativePath;
  }

  return resources;
}

function buildHookRegistry(srcDir) {
  const hookEntries = discover({
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

  const hooks = {};
  for (const entry of hookEntries) {
    hooks[entry.id] = { module: entry.module, fn: entry.fn };
  }

  return hooks;
}

function buildRegistries(srcDir) {
  return [
    { fileName: 'agent-registry.json', data: buildAgentRegistry(srcDir) },
    { fileName: 'resource-registry.json', data: buildResourceRegistry(srcDir) },
    { fileName: 'hook-registry.json', data: buildHookRegistry(srcDir) },
  ];
}

function collectRegistryOutputs(srcDir, rootDir = path.dirname(srcDir)) {
  const generatedDir = path.join(srcDir, 'generated');

  return buildRegistries(srcDir).map(({ fileName, data }) => ({
    outputPath: path.relative(rootDir, path.join(generatedDir, fileName)),
    content: serializeRegistry(data),
  }));
}

/**
 * Run all discovery scans and write the resulting JSON registry files to
 * src/generated/.
 * @param {string} srcDir - Absolute path to the src/ directory
 */
function generateRegistries(srcDir) {
  const generatedDir = path.join(srcDir, 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  for (const { fileName, data } of buildRegistries(srcDir)) {
    generateRegistry(data, path.join(generatedDir, fileName));
  }
}

module.exports = {
  collectRegistryOutputs,
  generateRegistries,
};
