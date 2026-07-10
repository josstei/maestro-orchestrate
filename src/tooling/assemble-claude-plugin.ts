#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { moduleDirname } from '../core/module-path.js';
import { resolvePackageRoot } from '../core/package-root.js';
import { readJson, runAsMain } from './lib/cli.js';
import { buildMetadataContext } from '../platforms/metadata-shared.js';

import {
  CLAUDE_LOCAL_PLUGIN_DIR,
  CLAUDE_LOCAL_BUNDLE_DIR,
  PROMOTED_CONTENT_COPY_MAP,
  buildPromotedPluginManifestFiles,
} from '../platforms/claude/local-plugin-layout.js';

const ROOT = resolvePackageRoot(moduleDirname(import.meta.url), { malformedJson: 'throw' });

type AssembleOptions = {
  root?: string;
  outDir?: string;
};

type AssembleResult = {
  pluginDir: string;
  bundleDir: string;
  command: string;
};

function assertAssemblyInputs(root: string): void {
  if (!fs.existsSync(path.join(root, 'claude', 'agents'))) {
    throw new Error(
      "Generated claude/ tree not found. Run 'just generate' (or 'npm run generate') before assembling the local Claude plugin."
    );
  }
  if (!fs.existsSync(path.join(root, 'dist', 'src', 'mcp', 'maestro-server.js'))) {
    throw new Error("Compiled dist/src MCP server not found. Run 'npm run build' before assembling the local Claude plugin.");
  }
}

function resetDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function assembleClaudePlugin(options: AssembleOptions = {}): AssembleResult {
  const root = options.root || ROOT;
  const outDir = options.outDir || path.join(root, 'dist');

  assertAssemblyInputs(root);

  const pluginDir = path.join(outDir, CLAUDE_LOCAL_PLUGIN_DIR);
  const bundleDir = path.join(outDir, CLAUDE_LOCAL_BUNDLE_DIR);
  const compiledBundleDir = path.join(root, 'dist', 'src');

  resetDir(pluginDir);

  if (path.resolve(compiledBundleDir) !== path.resolve(bundleDir)) {
    resetDir(bundleDir);
    fs.cpSync(compiledBundleDir, bundleDir, { recursive: true });
  }

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

runAsMain(import.meta.url, 'Assemble Claude plugin', () => {
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

export { assembleClaudePlugin };
