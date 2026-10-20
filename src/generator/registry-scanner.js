'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../lib/frontmatter');
const { formatJson } = require('../lib/io');
const { toPascalCase } = require('../lib/naming');
const { declaredTools } = require('../core/agent-tools');
const { globFiles } = require('./glob-files');

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

/**
 * Sort registry entries by id. localeCompare, not code-unit order, is the
 * order the committed registries are in.
 * @template {{ id: string }} T
 * @param {T[]} entries
 * @returns {T[]}
 */
function sortById(entries) {
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

function buildAgentRegistry(srcDir) {
  const agents = globFiles(srcDir, 'agents/*.md').map((relativePath) => {
    const { frontmatter } = parse(fs.readFileSync(path.join(srcDir, relativePath), 'utf8'));
    const id = path.posix.basename(relativePath, '.md');
    return { id, name: frontmatter.name || id, capabilities: capabilityTier(declaredTools(frontmatter)) };
  });

  return sortById(agents).map(({ name, capabilities }) => ({ name, capabilities }));
}

/**
 * Key a resource by its file name, or a skill's SKILL.md by its directory name.
 * @param {string} relativePath - Posix path relative to the source directory
 * @returns {string}
 */
function resourceId(relativePath) {
  return path.posix.basename(relativePath) === 'SKILL.md'
    ? path.posix.basename(path.posix.dirname(relativePath))
    : path.posix.basename(relativePath, '.md');
}

function buildResourceRegistry(srcDir) {
  const resources = (pattern) =>
    sortById(globFiles(srcDir, pattern).map((relativePath) => ({ id: resourceId(relativePath), relativePath })));

  return Object.fromEntries(
    [
      ...resources('skills/shared/**/*.md'),
      ...resources('templates/*.md'),
      ...resources('references/*.md'),
    ].map(({ id, relativePath }) => [id, relativePath])
  );
}

function buildHookRegistry(srcDir) {
  const hooks = globFiles(srcDir, 'hooks/logic/*-logic.js').map((relativePath) => ({
    id: path.posix.basename(relativePath).replace(/-logic\.js$/, ''),
    relativePath,
  }));

  return Object.fromEntries(
    sortById(hooks).map(({ id, relativePath }) => [id, { module: relativePath, fn: `handle${toPascalCase(id)}` }])
  );
}

function collectRegistryOutputs(srcDir, rootDir) {
  const generatedDir = path.relative(rootDir, path.join(srcDir, 'generated')).split(path.sep).join('/');
  const registries = [
    { fileName: 'agent-registry.json', data: buildAgentRegistry(srcDir) },
    { fileName: 'resource-registry.json', data: buildResourceRegistry(srcDir) },
    { fileName: 'hook-registry.json', data: buildHookRegistry(srcDir) },
  ];

  return registries.map(({ fileName, data }) => ({
    outputPath: `${generatedDir}/${fileName}`,
    content: formatJson(data),
  }));
}

module.exports = {
  collectRegistryOutputs,
};
