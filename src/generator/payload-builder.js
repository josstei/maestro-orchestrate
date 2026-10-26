'use strict';

const fs = require('node:fs');
const { VERSION_JSON_FILENAME } = require('../core/version');
const { formatJson } = require('../lib/io');
const { buildDependencyGraph } = require('./dependency-graph');
const { safeResolve } = require('./file-writer');
const { hasDetachedPayload, launcherTargets } = require('./runtime-entrypoints');

const STATE_SCRIPTS = Object.freeze([
  'ensure-workspace.js',
  'read-active-session.js',
  'read-setting.js',
  'read-state.js',
  'write-state.js',
]);

/**
 * Plan an installed runtime's complete file closure without writing anything.
 * Source overrides carry freshly generated registries before they reach disk.
 * Every filesystem-served asset and public CLI is an explicit root; imports
 * determine the remaining implementation files, including finite dynamic loads.
 * Output paths are relative to the runtime's `${outputDir}src/`.
 * @returns {{ outputs: Array<{ outputPath: string, content: string, reason: string }> }}
 */
function planDetachedPayload(srcDir, runtime, version, { sourceOverrides = new Map() } = {}) {
  if (!hasDetachedPayload(runtime)) {
    throw new Error(`Unknown detached payload runtime: ${runtime.name}`);
  }
  const root = fs.realpathSync(srcDir);
  function read(relativePath) {
    const absolute = safeResolve(relativePath, root, { requireFile: true });
    if (sourceOverrides.has(relativePath)) return sourceOverrides.get(relativePath);
    return fs.readFileSync(absolute, 'utf8');
  }

  const roots = new Map();
  // The first reason recorded for a root is kept.
  const addRoot = (file, reason) => { if (!roots.has(file)) roots.set(file, reason); };
  addRoot('mcp/maestro-server.js', 'local MCP server');
  addRoot(`platforms/${runtime.name}/runtime-config.js`, 'installed runtime configuration');
  for (const script of STATE_SCRIPTS) addRoot(`scripts/${script}`, 'documented state CLI');
  addRoot('generated/agent-registry.json', 'agent catalog');
  addRoot('generated/resource-registry.json', 'resource catalog');
  for (const agent of JSON.parse(read('generated/agent-registry.json'))) {
    addRoot(`agents/${agent.name}.md`, 'get_agent content');
  }
  addRoot('agents/shared/handoff-report.md', 'shared agent output contract');
  for (const [id, file] of Object.entries(JSON.parse(read('generated/resource-registry.json')))) {
    addRoot(file, `get_skill_content resource: ${id}`);
  }
  for (const target of launcherTargets(runtime)) addRoot(target, 'public launcher target');
  if (runtime.launchers.hookRunner) {
    addRoot(`platforms/${runtime.name}/hook-adapter.js`, 'installed hook adapter');
    addRoot('generated/hook-registry.json', 'public hook-name catalog');
    for (const [name, hook] of Object.entries(JSON.parse(read('generated/hook-registry.json')))) {
      addRoot(hook.module, `public hook: ${name}`);
    }
  }

  // Validate roots even if they do not contain JavaScript (markdown is served
  // through registries, not imports). A missing asset must fail before pruning.
  for (const file of roots.keys()) read(file);
  const graph = buildDependencyGraph({ rootDir: srcDir, roots: [...roots.keys()], runtime: runtime.name, sourceOverrides });
  if (graph.issues.length > 0) {
    throw new Error(`Invalid ${runtime.name} payload dependencies:\n${graph.issues.map((issue) => `${issue.file}: ${issue.message}`).join('\n')}`);
  }
  const dependencyReasons = new Map(graph.edges.map((edge) => [edge.to, `dependency of ${edge.from}`]));
  const outputs = graph.nodes.map((outputPath) => ({
    outputPath,
    content: read(outputPath),
    reason: roots.get(outputPath) || dependencyReasons.get(outputPath),
  }));
  outputs.push({ outputPath: VERSION_JSON_FILENAME, content: formatJson({ version }), reason: 'installed package version' });
  outputs.sort((a, b) => a.outputPath < b.outputPath ? -1 : a.outputPath > b.outputPath ? 1 : 0);
  return { outputs };
}

module.exports = { planDetachedPayload };
