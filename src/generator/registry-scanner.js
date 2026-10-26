'use strict';

const path = require('node:path');
const { findFiles } = require('../lib/discovery');
const { parse } = require('../lib/frontmatter');
const { formatJson, readFileSafe } = require('../lib/io');
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
  return findFiles(path.join(srcDir, 'agents'), '*.md')
    .sort((a, b) => path.basename(a, '.md').localeCompare(path.basename(b, '.md')))
    .map((filepath) => {
      const { frontmatter } = parse(readFileSafe(filepath));
      const tools = [].concat(frontmatter.tools || []);
      return { name: frontmatter.name || path.basename(filepath, '.md'), capabilities: capabilityTier(tools) };
    });
}

function markdownEntries(srcDir, subdir, pattern = '*.md') {
  return findFiles(path.join(srcDir, subdir), pattern)
    .map((filepath) => [
      subdir === 'skills/shared' && path.basename(filepath) === 'SKILL.md'
        ? path.basename(path.dirname(filepath)) : path.basename(filepath, '.md'),
      path.relative(srcDir, filepath).split(path.sep).join('/'),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
}

function buildResourceRegistry(srcDir) {
  return Object.fromEntries(
    [
      ...markdownEntries(srcDir, 'skills/shared', '**/*.md'),
      ...markdownEntries(srcDir, 'templates'),
      ...markdownEntries(srcDir, 'references'),
    ]
  );
}

function buildHookRegistry(srcDir) {
  return Object.fromEntries(
    findFiles(path.join(srcDir, 'hooks', 'logic'), '*-logic.js')
      .map((filepath) => path.basename(filepath).replace(/-logic\.js$/, ''))
      .sort((a, b) => a.localeCompare(b))
      .map((id) => [
      id,
      { module: `hooks/logic/${id}-logic.js`, fn: `handle${toPascalCase(id)}` },
    ])
  );
}

function collectRegistryOutputs(srcDir, rootDir) {
  return Object.entries({
    'agent-registry.json': buildAgentRegistry(srcDir),
    'resource-registry.json': buildResourceRegistry(srcDir),
    'hook-registry.json': buildHookRegistry(srcDir),
  }).map(([fileName, data]) => ({
    outputPath: path.relative(rootDir, path.join(srcDir, 'generated', fileName)),
    content: formatJson(data),
  }));
}

module.exports = {
  collectRegistryOutputs,
};
