#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildDependencyGraph, getDependencyClosure } = require('../src/generator/dependency-graph');

const SRC_DIR = path.resolve(__dirname, '..', 'src');
// Runtime entrypoints are deliberately roots, even when only a host invokes
// them. Build roots are the APIs invoked by scripts/generate.js and tooling.
const PUBLIC_ROOTS = [
  'mcp/maestro-server.js',
  'platforms/shared/hook-runner.js',
  'platforms/antigravity/runtime-config.js',
  'platforms/antigravity/policy-enforcer.js',
  'platforms/claude/runtime-config.js',
  'platforms/claude/policy-enforcer.js',
  'platforms/codex/runtime-config.js',
  'platforms/qwen/runtime-config.js',
  'scripts/ensure-workspace.js',
  'scripts/read-active-session.js',
  'scripts/read-setting.js',
  'scripts/read-state.js',
  'scripts/write-state.js',
  'platforms/metadata.js',
  'generator/dependency-graph.js',
  'generator/entry-point-expander.js',
  'generator/file-writer.js',
  'generator/stub-outputs.js',
  'generator/payload-builder.js',
  'generator/registry-scanner.js',
  'generator/runtime-entrypoints.js',
  'generator/stale-pruner.js',
];

// Retain the required lower-layer root; a broken checkout must not pass as an
// empty graph. Other absent modules are allowed in isolated fixture repos.
fs.readdirSync(path.join(SRC_DIR, 'lib'));
const graph = buildDependencyGraph({ rootDir: SRC_DIR });
if (graph.issues.length > 0) {
  console.error('Layer boundary violations in canonical src/:');
  for (const issue of graph.issues) console.error(`  src/${issue.file}: ${issue.message} [${issue.code}:${issue.line}]`);
  process.exitCode = 1;
} else {
  const files = graph.nodes.filter((file) => /\.[cm]?js$/.test(file));
  console.log(`Layer boundaries clean: ${files.length} files scanned, 0 violations.`);
  const reachable = new Set(getDependencyClosure(graph, PUBLIC_ROOTS.filter((file) => graph.nodes.includes(file))));
  const unreachable = files.filter((file) => !reachable.has(file));
  if (unreachable.length > 0) {
    console.log(`Advisory: modules not reached from declared public/build roots: ${unreachable.join(', ')}`);
  }
}
