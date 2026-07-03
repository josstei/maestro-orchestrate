#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson, runAsMain } = require('./lib/cli');
const { buildMetadataContext } = require('../src/platforms/metadata-shared');
const {
  CLAUDE_LOCAL_PLUGIN_DIR,
  CLAUDE_LOCAL_BUNDLE_DIR,
  PROMOTED_CONTENT_COPY_MAP,
  buildPromotedPluginManifestFiles,
} = require('../src/platforms/claude/local-plugin-layout');

const ROOT = path.resolve(__dirname, '..');

function assertAssemblyInputs(root) {
  if (!fs.existsSync(path.join(root, 'claude', 'agents'))) {
    throw new Error(
      "Generated claude/ tree not found. Run 'just generate' (or 'npm run generate') before assembling the local Claude plugin."
    );
  }
  if (!fs.existsSync(path.join(root, 'src', 'mcp', 'maestro-server.js'))) {
    throw new Error('Canonical src/mcp/maestro-server.js not found; cannot bundle the MCP server.');
  }
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function assembleClaudePlugin(options = {}) {
  const root = options.root || ROOT;
  const outDir = options.outDir || path.join(root, 'dist');

  assertAssemblyInputs(root);

  const pluginDir = path.join(outDir, CLAUDE_LOCAL_PLUGIN_DIR);
  const bundleDir = path.join(outDir, CLAUDE_LOCAL_BUNDLE_DIR);

  resetDir(pluginDir);
  resetDir(bundleDir);

  fs.cpSync(path.join(root, 'src'), bundleDir, { recursive: true });

  for (const entry of PROMOTED_CONTENT_COPY_MAP) {
    fs.cpSync(path.join(root, entry.from), path.join(pluginDir, entry.to), { recursive: true });
  }

  const context = buildMetadataContext(readJson(path.join(root, 'package.json')));
  for (const file of buildPromotedPluginManifestFiles(context)) {
    const target = path.join(pluginDir, file.relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, 'utf8');
  }

  return {
    pluginDir,
    bundleDir,
    command: `claude --plugin-dir ${pluginDir}`,
  };
}

runAsMain(module, 'Assemble Claude plugin', () => {
  const result = assembleClaudePlugin();
  console.log('Assembled a self-contained Claude plugin for local development:');
  console.log(`  plugin dir:  ${result.pluginDir}`);
  console.log(`  bundled src: ${result.bundleDir}`);
  console.log('');
  console.log('Load it in one step:');
  console.log(`  ${result.command}`);
  console.log('');
  console.log("Re-run 'just dev-load-claude' after editing anything under src/ to refresh the promoted agents, skills, and bundled server.");
});

module.exports = { assembleClaudePlugin };
