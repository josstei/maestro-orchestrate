'use strict';

const path = require('node:path');
const { discover, serializeRegistry } = require('../lib/discovery');
const { parse } = require('../lib/frontmatter');
const { toPascalCase } = require('../lib/naming');

/**
 * Derive an agent's tool tier from its canonical `tools` list, so the tier
 * cannot disagree with the tools the agent actually has.
 * @param {string[]} tools - Canonical tool names
 * @returns {'read_only'|'read_shell'|'read_write'|'full'}
 */
function capabilityTier(tools) {
  const canWrite = tools.includes('write_file') || tools.includes('replace');
  const canShell = tools.includes('run_shell_command');
  if (canWrite && canShell) return 'full';
  if (canWrite) return 'read_write';
  if (canShell) return 'read_shell';
  return 'read_only';
}

function buildAgentRegistry(srcDir) {
  const agentEntries = discover({
    dir: path.join(srcDir, 'agents'),
    pattern: '*.md',
    identity: (filepath) => path.basename(filepath, '.md'),
    metadata: (filepath, content) => {
      const { frontmatter } = parse(content);
      const name = frontmatter.name || path.basename(filepath, '.md');
      const rawTools = frontmatter.tools || [];
      const tools = Array.isArray(rawTools) ? rawTools : [rawTools];
      return { name, capabilities: capabilityTier(tools) };
    },
  });

  return agentEntries.map(({ name, capabilities }) => ({ name, capabilities }));
}

function markdownEntries(
  srcDir,
  subdir,
  pattern = '*.md',
  identity = (filepath) => path.basename(filepath, '.md')
) {
  return discover({
    dir: path.join(srcDir, subdir),
    pattern,
    identity,
    metadata: (filepath) => ({
      relativePath: path.relative(srcDir, filepath).split(path.sep).join('/'),
    }),
  });
}

function skillIdentity(filepath) {
  if (path.basename(filepath) === 'SKILL.md') {
    return path.basename(path.dirname(filepath));
  }
  return path.basename(filepath, '.md');
}

function buildResourceRegistry(srcDir) {
  return Object.fromEntries(
    [
      ...markdownEntries(srcDir, path.join('skills', 'shared'), '**/*.md', skillIdentity),
      ...markdownEntries(srcDir, 'templates'),
      ...markdownEntries(srcDir, 'references'),
    ].map((entry) => [entry.id, entry.relativePath])
  );
}

function buildHookRegistry(srcDir) {
  const hookEntries = discover({
    dir: path.join(srcDir, 'hooks', 'logic'),
    pattern: '*-logic.js',
    identity: (filepath) => path.basename(filepath).replace(/-logic\.js$/, ''),
  });

  return Object.fromEntries(
    hookEntries.map(({ id }) => [
      id,
      { module: `hooks/logic/${id}-logic.js`, fn: `handle${toPascalCase(id)}` },
    ])
  );
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
