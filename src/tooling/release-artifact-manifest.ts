import fs from 'node:fs';
import path from 'node:path';
import {
  DENIED_ARTIFACT_PATHS,
  DENIED_ARTIFACT_PATTERNS,
  REQUIRED_PACKAGE_FILES,
  RUNTIME_DIST_PATHS,
  releasePaths,
} from './artifact-policy.js';
import { readJson as readJsonFile } from './lib/cli.js';
import { assertRuntimePayloadContract } from './runtime-payload-contract.js';
const RELEASE_ARTIFACT_PATHS = releasePaths();

type VersionEntry = [label: string, version: string];

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function normalizeArtifactPath(relativePath: string): string {
  const normalized = toPosixPath(relativePath).replace(/\/+$/, '');
  return normalized === '.' ? '' : normalized.replace(/^\.\//, '');
}

function isDeniedPath(relativePath: string): boolean {
  const normalized = normalizeArtifactPath(relativePath);
  const deniedByPath = DENIED_ARTIFACT_PATHS.some((denied) => {
    return normalized === denied || normalized.startsWith(`${denied}/`);
  });

  return deniedByPath || DENIED_ARTIFACT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isReleaseArtifactPathAllowed(relativePath: string): boolean {
  const normalized = normalizeArtifactPath(relativePath);

  if (!normalized) {
    return true;
  }

  return RELEASE_ARTIFACT_PATHS.some((allowed) => {
    return (
      normalized === allowed ||
      normalized.startsWith(`${allowed}/`) ||
      allowed.startsWith(`${normalized}/`)
    );
  });
}

function ensureInsideRoot(root: string, targetPath: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository root: ${targetPath}`);
  }
}

function assertRequiredArtifactPaths(root: string): void {
  const missing: string[] = [];

  for (const relativePath of RELEASE_ARTIFACT_PATHS) {
    if (isDeniedPath(relativePath)) {
      throw new Error(`Release artifact allowlist contains denied path: ${relativePath}`);
    }

    const sourcePath = path.join(root, relativePath);
    ensureInsideRoot(root, sourcePath);

    if (!fs.existsSync(sourcePath)) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Required release artifact paths are missing: ${missing.join(', ')}`);
  }
}

function walkArtifactFiles(root: string): string[] {
  const files: string[] = [];
  const queue = ['.'];

  while (queue.length > 0) {
    const relativeDir = queue.pop();
    if (!relativeDir) {
      continue;
    }
    const absoluteDir = path.join(root, relativeDir);

    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = normalizeArtifactPath(path.posix.join(relativeDir, entry.name));
      files.push(relativePath);

      if (entry.isDirectory()) {
        queue.push(relativePath);
      }
    }
  }

  return files.sort();
}

function assertReleaseArtifactContents(root: string): void {
  const denied: string[] = [];
  const unexpected: string[] = [];

  for (const relativePath of walkArtifactFiles(root)) {
    if (isDeniedPath(relativePath)) {
      denied.push(relativePath);
      continue;
    }

    if (!isReleaseArtifactPathAllowed(relativePath)) {
      unexpected.push(relativePath);
    }
  }

  if (denied.length > 0) {
    throw new Error(`Release artifact contains denied paths: ${denied.join(', ')}`);
  }

  if (unexpected.length > 0) {
    throw new Error(`Release artifact contains unallowlisted paths: ${unexpected.join(', ')}`);
  }
}

function readJson(root: string, relativePath: string): any {
  try {
    return readJsonFile(path.join(root, relativePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${relativePath}: ${message}`);
  }
}

function requireVersion(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing version value for ${label}`);
  }

  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing string value for ${label}`);
  }

  return value;
}

function findNamedPlugin(marketplace: any, name: string, relativePath: string): any {
  if (!Array.isArray(marketplace.plugins)) {
    throw new Error(`${relativePath} must contain a plugins array`);
  }

  const plugin = marketplace.plugins.find((entry: any) => entry && entry.name === name);
  if (!plugin) {
    throw new Error(`${relativePath} missing plugin entry "${name}"`);
  }

  return plugin;
}

function getVersionEntries(root: string): VersionEntry[] {
  const pkg = readJson(root, 'package.json');
  const gemini = readJson(root, 'gemini-extension.json');
  const qwen = readJson(root, 'qwen-extension.json');
  const agy = readJson(root, 'agy-extension.json');
  const claudePlugin = readJson(root, '.claude-plugin/plugin.json');
  const codexPlugin = readJson(root, 'plugins/maestro/.codex-plugin/plugin.json');
  const claudeMarketplace = readJson(root, '.claude-plugin/marketplace.json');
  const claudeMarketplacePlugin = findNamedPlugin(
    claudeMarketplace,
    'maestro',
    '.claude-plugin/marketplace.json'
  );

  return [
    ['package.json', requireVersion(pkg.version, 'package.json')],
    ['gemini-extension.json', requireVersion(gemini.version, 'gemini-extension.json')],
    ['qwen-extension.json', requireVersion(qwen.version, 'qwen-extension.json')],
    ['agy-extension.json', requireVersion(agy.version, 'agy-extension.json')],
    ['.claude-plugin/plugin.json', requireVersion(claudePlugin.version, 'claude plugin')],
    ['plugins/maestro/.codex-plugin/plugin.json', requireVersion(codexPlugin.version, 'Codex plugin')],
    ['.claude-plugin/marketplace.json metadata.version', requireVersion(claudeMarketplace.metadata && claudeMarketplace.metadata.version, 'Claude marketplace metadata')],
    ['.claude-plugin/marketplace.json plugins.maestro.version', requireVersion(claudeMarketplacePlugin.version, 'Claude marketplace plugin')],
  ];
}

function assertVersionConsistency(root: string, expectedVersion: string | null = null): string {
  const entries = getVersionEntries(root);
  const baseline = expectedVersion || entries[0]?.[1];
  if (!baseline) {
    throw new Error('Release manifest version entries are empty');
  }
  const mismatches = entries.filter(([, version]) => version !== baseline);

  if (mismatches.length > 0) {
    const details = mismatches.map(([label, version]) => `${label}=${version}`).join(', ');
    throw new Error(`Release manifest version mismatch; expected ${baseline}: ${details}`);
  }

  return baseline;
}

function assertRuntimeManifestShape(root: string, expectedVersion: string | null = null): string {
  assertRuntimePayloadContract();
  const version = assertVersionConsistency(root, expectedVersion);
  const pkg = readJson(root, 'package.json');
  const gemini = readJson(root, 'gemini-extension.json');
  const qwen = readJson(root, 'qwen-extension.json');
  const agy = readJson(root, 'agy-extension.json');
  const claudeMarketplace = readJson(root, '.claude-plugin/marketplace.json');
  const codexMarketplace = readJson(root, '.agents/plugins/marketplace.json');
  const claudePlugin = readJson(root, '.claude-plugin/plugin.json');
  const codexPlugin = readJson(root, 'plugins/maestro/.codex-plugin/plugin.json');
  const claudeMcp = readJson(root, 'claude/.mcp.json');
  const codexMcp = readJson(root, 'plugins/maestro/.mcp.json');

  const packageName = requireString(pkg.name, 'package.json name');

  if (
    !pkg.bin ||
    pkg.bin['maestro-install-codex'] !== './dist/src/bin/maestro-install-codex.js' ||
    pkg.bin['maestro-mcp-server'] !== './dist/src/bin/maestro-mcp-server.js'
  ) {
    throw new Error('package.json bin targets must launch compiled dist/src/bin entrypoints');
  }

  const claudeMarketplacePlugin = findNamedPlugin(
    claudeMarketplace,
    'maestro',
    '.claude-plugin/marketplace.json'
  );
  if (
    !claudeMarketplacePlugin.source ||
    claudeMarketplacePlugin.source.source !== 'github' ||
    claudeMarketplacePlugin.source.repo !== 'josstei/maestro-orchestrate' ||
    claudeMarketplacePlugin.source.ref !== 'dist'
  ) {
    throw new Error('.claude-plugin/marketplace.json maestro source must be github josstei/maestro-orchestrate@dist');
  }

  const codexMarketplacePlugin = findNamedPlugin(
    codexMarketplace,
    'maestro',
    '.agents/plugins/marketplace.json'
  );
  if (
    !codexMarketplacePlugin.source ||
    codexMarketplacePlugin.source.source !== 'git-subdir' ||
    codexMarketplacePlugin.source.path !== './plugins/maestro' ||
    codexMarketplacePlugin.source.ref !== 'dist'
  ) {
    throw new Error('.agents/plugins/marketplace.json maestro source must be git-subdir ./plugins/maestro@dist');
  }

  if (gemini.contextFileName !== 'GEMINI.md' || !gemini.mcpServers || !gemini.mcpServers.maestro) {
    throw new Error('gemini-extension.json must define GEMINI.md and maestro MCP server');
  }

  if (qwen.contextFileName !== 'QWEN.md' || !qwen.mcpServers || !qwen.mcpServers.maestro) {
    throw new Error('qwen-extension.json must define QWEN.md and maestro MCP server');
  }

  if (agy.contextFileName !== 'AGY.md' || !agy.mcpServers || !agy.mcpServers.maestro) {
    throw new Error('agy-extension.json must define AGY.md and maestro MCP server');
  }

  if (claudePlugin.hooks !== './claude/hooks/claude-hooks.json') {
    throw new Error('claude plugin manifest must reference ./claude/hooks/claude-hooks.json');
  }

  if (claudePlugin.mcpServers !== './claude/.mcp.json') {
    throw new Error('claude plugin manifest must reference ./claude/.mcp.json');
  }

  if (
    codexPlugin.skills !== './skills/' ||
    codexPlugin.mcpServers !== './.mcp.json' ||
    codexPlugin.apps !== './.app.json'
  ) {
    throw new Error('Codex plugin manifest must reference skills, MCP, and app config files');
  }

  const expectedPackageSpec = `${packageName}@${version}`;

  const claudeServer = claudeMcp.mcpServers && claudeMcp.mcpServers.maestro;
  if (
    !claudeServer ||
    claudeServer.command !== 'npx' ||
    !Array.isArray(claudeServer.args) ||
    !claudeServer.args.includes('-p') ||
    !claudeServer.args.includes(expectedPackageSpec) ||
    !claudeServer.args.includes('maestro-mcp-server') ||
    !claudeServer.env ||
    claudeServer.env.MAESTRO_RUNTIME !== 'claude'
  ) {
    throw new Error(`claude/.mcp.json must launch ${expectedPackageSpec} with MAESTRO_RUNTIME=claude`);
  }

  const codexServer = codexMcp.mcpServers && codexMcp.mcpServers.maestro;
  if (
    !codexServer ||
    codexServer.command !== 'npx' ||
    !Array.isArray(codexServer.args) ||
    !codexServer.args.includes('-p') ||
    !codexServer.args.includes(expectedPackageSpec) ||
    !codexServer.args.includes('maestro-mcp-server')
  ) {
    throw new Error(`plugins/maestro/.mcp.json must launch ${expectedPackageSpec}`);
  }

  const requiredRuntimeFiles = [
    'dist/src/bin/maestro-install-codex.js',
    'dist/src/bin/maestro-mcp-server.js',
    'dist/src/generated/runtime-content-registry.json',
    'dist/src/generated/runtime-content-registry.txt.gz',
    'dist/src/mcp/maestro-server.js',
    'dist/src/platforms/runtime-declarations.js',
  ];

  for (const relativePath of requiredRuntimeFiles) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      throw new Error(`Required runtime file missing: ${relativePath}`);
    }
  }

  for (const binPath of ['dist/src/bin/maestro-install-codex.js', 'dist/src/bin/maestro-mcp-server.js']) {
    const binMode = fs.statSync(path.join(root, binPath)).mode;
    if ((binMode & 0o111) === 0) {
      throw new Error(`${binPath} must be executable`);
    }
  }

  if (fs.existsSync(path.join(root, 'claude/src'))) {
    throw new Error('Claude detached payload must not be present: claude/src');
  }

  if (fs.existsSync(path.join(root, 'plugins/maestro/src'))) {
    throw new Error('Codex detached payload must not be present: plugins/maestro/src');
  }

  return version;
}

export { DENIED_ARTIFACT_PATHS, DENIED_ARTIFACT_PATTERNS, RELEASE_ARTIFACT_PATHS, REQUIRED_PACKAGE_FILES, RUNTIME_DIST_PATHS, assertReleaseArtifactContents, assertRequiredArtifactPaths, assertRuntimeManifestShape, assertVersionConsistency, getVersionEntries, isDeniedPath, isReleaseArtifactPathAllowed, requireString, readJson, toPosixPath };
