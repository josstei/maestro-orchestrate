'use strict';

const path = require('node:path');
const { discover, serializeRegistry } = require('../lib/discovery');
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

function flatMarkdownEntries(srcDir, subdir) {
  return discover({
    dir: path.join(srcDir, subdir),
    pattern: '*.md',
    identity: (filepath) => path.basename(filepath, '.md'),
    metadata: (filepath) => ({
      relativePath: `${subdir}/${path.basename(filepath)}`,
    }),
  });
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

  const resources = {};
  for (const entry of [
    ...skillEntries,
    ...flatMarkdownEntries(srcDir, 'templates'),
    ...flatMarkdownEntries(srcDir, 'references'),
  ]) {
    resources[entry.id] = entry.relativePath;
  }

  return resources;
}

function buildHookRegistry(srcDir) {
  const hookEntries = discover({
    dir: path.join(srcDir, 'hooks', 'logic'),
    pattern: '*-logic.js',
    identity: (filepath) => path.basename(filepath).replace(/-logic\.js$/, ''),
  });

  const hooks = {};
  for (const { id } of hookEntries) {
    hooks[id] = { module: `hooks/logic/${id}-logic.js`, fn: `handle${toPascalCase(id)}` };
  }

  return hooks;
}

function collectRegistryOutputs(srcDir, rootDir = path.dirname(srcDir)) {
  const generatedDir = path.join(srcDir, 'generated');
  const registries = [
    { fileName: 'agent-registry.json', data: buildAgentRegistry(srcDir) },
    { fileName: 'resource-registry.json', data: buildResourceRegistry(srcDir) },
    { fileName: 'hook-registry.json', data: buildHookRegistry(srcDir) },
  ];

  return registries.map(({ fileName, data }) => ({
    outputPath: path.relative(rootDir, path.join(generatedDir, fileName)),
    content: serializeRegistry(data),
  }));
}

module.exports = {
  collectRegistryOutputs,
};
