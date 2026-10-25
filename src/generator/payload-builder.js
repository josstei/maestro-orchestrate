'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { VERSION_JSON_FILENAME } = require('../core/version');
const { formatJson } = require('../lib/io');
const { buildDependencyGraph } = require('./dependency-graph');
const { safeResolve } = require('./file-writer');
const { pruneStaleFiles } = require('./stale-pruner');

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
 */
function planDetachedPayload(srcDir, outputDir, runtimeName, version, { sourceOverrides = new Map() } = {}) {
  if (!['antigravity', 'claude', 'codex'].includes(runtimeName)) {
    throw new Error(`Unknown detached payload runtime: ${runtimeName}`);
  }
  const root = fs.realpathSync(srcDir);
  const sourceParent = path.dirname(path.resolve(srcDir));
  const projectRoot = fs.realpathSync(sourceParent);
  outputDir = safeResolve(path.relative(sourceParent, path.resolve(outputDir)), projectRoot);
  function read(relativePath) {
    const absolute = safeResolve(relativePath, root, { requireFile: true });
    if (sourceOverrides.has(relativePath)) return sourceOverrides.get(relativePath);
    return fs.readFileSync(absolute, 'utf8');
  }

  const roots = new Map();
  const addRoot = (file, reason) => roots.set(file, reason);
  addRoot('mcp/maestro-server.js', 'local MCP server');
  addRoot(`platforms/${runtimeName}/runtime-config.js`, 'installed runtime configuration');
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
  if (runtimeName !== 'codex') {
    addRoot('platforms/shared/hook-runner.js', 'public hook runner');
    addRoot(`platforms/${runtimeName}/hook-adapter.js`, 'installed hook adapter');
    addRoot(`platforms/${runtimeName}/policy-enforcer.js`, 'public policy enforcer');
    addRoot('generated/hook-registry.json', 'public hook-name catalog');
    for (const [name, hook] of Object.entries(JSON.parse(read('generated/hook-registry.json')))) {
      addRoot(hook.module, `public hook: ${name}`);
    }
  }

  // Validate roots even if they do not contain JavaScript (markdown is served
  // through registries, not imports). A missing asset must fail before pruning.
  for (const file of roots.keys()) read(file);
  const graph = buildDependencyGraph({ rootDir: srcDir, roots: [...roots.keys()], runtime: runtimeName, sourceOverrides });
  if (graph.issues.length > 0) {
    throw new Error(`Invalid ${runtimeName} payload dependencies:\n${graph.issues.map((issue) => `${issue.file}: ${issue.message}`).join('\n')}`);
  }
  const dependencyReasons = new Map(graph.edges.map((edge) => [edge.to, `dependency of ${edge.from}`]));
  const outputs = graph.reachable.map((outputPath) => ({
    outputPath,
    content: read(outputPath),
    reason: roots.get(outputPath) || dependencyReasons.get(outputPath),
  }));
  outputs.push({ outputPath: VERSION_JSON_FILENAME, content: formatJson({ version }), reason: 'installed package version' });
  outputs.sort((a, b) => a.outputPath < b.outputPath ? -1 : a.outputPath > b.outputPath ? 1 : 0);
  const manifestPaths = new Set(outputs.map(({ outputPath }) => outputPath));
  for (const { outputPath } of outputs) safeResolve(outputPath, outputDir, { requireFile: true });
  const { pruned } = pruneStaleFiles({ rootDir: outputDir, manifestPaths, ownedDirs: [''], dryRun: true });
  return { runtimeName, outputDir, outputs, manifestPaths, removedPaths: pruned.sort() };
}

module.exports = { planDetachedPayload };
