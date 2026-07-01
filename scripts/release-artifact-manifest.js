'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { RUNTIME_PAYLOAD_CONTRACT } = require('../src/platforms/runtime-payload-contract');

const RUNTIME_SOURCE_PATHS = Object.freeze([
  'src/agents',
  'src/config',
  'src/core',
  'src/generated',
  'src/hooks',
  'src/lib/errors',
  'src/lib/framework-detection.js',
  'src/lib/frontmatter',
  'src/lib/io',
  'src/lib/naming',
  'src/lib/validation',
  'src/mcp',
  'src/platforms/claude/runtime-config.js',
  'src/platforms/codex/runtime-config.js',
  'src/platforms/gemini/runtime-config.js',
  'src/platforms/qwen/runtime-config.js',
  'src/platforms/shared',
  'src/references',
  'src/scripts',
  'src/skills',
  'src/state',
  'src/templates',
]);

const RELEASE_ARTIFACT_PATHS = [
  '.agents/plugins/marketplace.json',
  '.claude-plugin/marketplace.json',
  '.claude-plugin/plugin.json',
  'CHANGELOG.md',
  'EXAMPLES.md',
  'GEMINI.md',
  'LICENSE',
  'QWEN.md',
  'README.md',
  'agents',
  'bin/maestro-install-codex.js',
  'bin/maestro-mcp-server.js',
  'claude/.mcp.json',
  'claude/README.md',
  'claude/agents',
  'claude/hooks',
  'claude/mcp-config.example.json',
  'claude/mcp',
  'claude/scripts',
  'claude/skills',
  'commands',
  'docs/runtime-gemini.md',
  'docs/runtime-claude.md',
  'docs/runtime-codex.md',
  'docs/runtime-qwen.md',
  'docs/usage.md',
  'gemini-extension.json',
  'hooks',
  'mcp',
  'package-lock.json',
  'package.json',
  'plugins/maestro/.app.json',
  'plugins/maestro/.codex-plugin',
  'plugins/maestro/.mcp.json',
  'plugins/maestro/README.md',
  'plugins/maestro/references',
  'plugins/maestro/skills',
  'policies',
  'qwen',
  'qwen-extension.json',
  ...RUNTIME_SOURCE_PATHS,
];

const DENIED_ARTIFACT_PATHS = [
  '.git',
  '.github',
  '.gemini',
  '.gemini_security',
  '.claude',
  '.worktrees',
  '.serena',
  '.superpowers',
  'coverage',
  'dist',
  'docs/maestro',
  'docs/superpowers',
  'node_modules',
  'scripts',
  'tests',
  'tmp',
  'temp',
  'hooks/permissions.json',
  'claude/src',
  'plugins/maestro/src',
];

const DENIED_ARTIFACT_PATTERNS = [
  /(^|\/)__tests__(\/|$)/,
  /\.spec\.[cm]?js$/,
  /\.test\.[cm]?js$/,
];

const REQUIRED_PACKAGE_FILES = Object.freeze([
  ...new Set(RUNTIME_PAYLOAD_CONTRACT.flatMap((runtime) => runtime.packageInvariants || [])),
].sort());

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function normalizeArtifactPath(relativePath) {
  const normalized = toPosixPath(relativePath).replace(/\/+$/, '');
  return normalized === '.' ? '' : normalized.replace(/^\.\//, '');
}

function isDeniedPath(relativePath) {
  const normalized = normalizeArtifactPath(relativePath);
  const deniedByPath = DENIED_ARTIFACT_PATHS.some((denied) => {
    return normalized === denied || normalized.startsWith(`${denied}/`);
  });

  return deniedByPath || DENIED_ARTIFACT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isReleaseArtifactPathAllowed(relativePath) {
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

function ensureInsideRoot(root, targetPath) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository root: ${targetPath}`);
  }
}

function assertRequiredArtifactPaths(root) {
  const missing = [];

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

function walkArtifactFiles(root) {
  const files = [];
  const queue = ['.'];

  while (queue.length > 0) {
    const relativeDir = queue.pop();
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

function assertReleaseArtifactContents(root) {
  const denied = [];
  const unexpected = [];

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

function readJson(root, relativePath) {
  const filePath = path.join(root, relativePath);
  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${relativePath}: ${error.message}`);
  }

  return parsed;
}

function requireVersion(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing version value for ${label}`);
  }

  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing string value for ${label}`);
  }

  return value;
}

function findNamedPlugin(marketplace, name, relativePath) {
  if (!Array.isArray(marketplace.plugins)) {
    throw new Error(`${relativePath} must contain a plugins array`);
  }

  const plugin = marketplace.plugins.find((entry) => entry && entry.name === name);
  if (!plugin) {
    throw new Error(`${relativePath} missing plugin entry "${name}"`);
  }

  return plugin;
}

function getVersionEntries(root) {
  const pkg = readJson(root, 'package.json');
  const gemini = readJson(root, 'gemini-extension.json');
  const qwen = readJson(root, 'qwen-extension.json');
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
    ['.claude-plugin/plugin.json', requireVersion(claudePlugin.version, 'claude plugin')],
    ['plugins/maestro/.codex-plugin/plugin.json', requireVersion(codexPlugin.version, 'Codex plugin')],
    ['.claude-plugin/marketplace.json metadata.version', requireVersion(claudeMarketplace.metadata && claudeMarketplace.metadata.version, 'Claude marketplace metadata')],
    ['.claude-plugin/marketplace.json plugins.maestro.version', requireVersion(claudeMarketplacePlugin.version, 'Claude marketplace plugin')],
  ];
}

function assertVersionConsistency(root, expectedVersion = null) {
  const entries = getVersionEntries(root);
  const baseline = expectedVersion || entries[0][1];
  const mismatches = entries.filter(([, version]) => version !== baseline);

  if (mismatches.length > 0) {
    const details = mismatches.map(([label, version]) => `${label}=${version}`).join(', ');
    throw new Error(`Release manifest version mismatch; expected ${baseline}: ${details}`);
  }

  return baseline;
}

function assertRuntimeManifestShape(root, expectedVersion = null) {
  const version = assertVersionConsistency(root, expectedVersion);
  const pkg = readJson(root, 'package.json');
  const gemini = readJson(root, 'gemini-extension.json');
  const qwen = readJson(root, 'qwen-extension.json');
  const claudeMarketplace = readJson(root, '.claude-plugin/marketplace.json');
  const codexMarketplace = readJson(root, '.agents/plugins/marketplace.json');
  const claudePlugin = readJson(root, '.claude-plugin/plugin.json');
  const codexPlugin = readJson(root, 'plugins/maestro/.codex-plugin/plugin.json');
  const claudeMcp = readJson(root, 'claude/.mcp.json');
  const codexMcp = readJson(root, 'plugins/maestro/.mcp.json');

  const packageName = requireString(pkg.name, 'package.json name');

  const claudeMarketplacePlugin = findNamedPlugin(
    claudeMarketplace,
    'maestro',
    '.claude-plugin/marketplace.json'
  );
  if (claudeMarketplacePlugin.source !== '.') {
    throw new Error('.claude-plugin/marketplace.json maestro source must be package root "."');
  }

  const codexMarketplacePlugin = findNamedPlugin(
    codexMarketplace,
    'maestro',
    '.agents/plugins/marketplace.json'
  );
  if (
    !codexMarketplacePlugin.source ||
    codexMarketplacePlugin.source.source !== 'local' ||
    codexMarketplacePlugin.source.path !== './plugins/maestro'
  ) {
    throw new Error('.agents/plugins/marketplace.json maestro source must be local ./plugins/maestro');
  }

  if (gemini.contextFileName !== 'GEMINI.md' || !gemini.mcpServers || !gemini.mcpServers.maestro) {
    throw new Error('gemini-extension.json must define GEMINI.md and maestro MCP server');
  }

  if (qwen.contextFileName !== 'QWEN.md' || !qwen.mcpServers || !qwen.mcpServers.maestro) {
    throw new Error('qwen-extension.json must define QWEN.md and maestro MCP server');
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

  const claudeServer = claudeMcp.mcpServers && claudeMcp.mcpServers.maestro;
  if (
    !claudeServer ||
    claudeServer.command !== 'node' ||
    !Array.isArray(claudeServer.args) ||
    !claudeServer.args.includes('${CLAUDE_PLUGIN_ROOT}/claude/mcp/maestro-server.js')
  ) {
    throw new Error('claude/.mcp.json must launch the bundled Maestro MCP server');
  }

  const codexServer = codexMcp.mcpServers && codexMcp.mcpServers.maestro;
  const expectedPackageSpec = `${packageName}@${version}`;
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
    'bin/maestro-install-codex.js',
    'bin/maestro-mcp-server.js',
    'src/mcp/maestro-server.js',
  ];

  for (const relativePath of requiredRuntimeFiles) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      throw new Error(`Required runtime file missing: ${relativePath}`);
    }
  }

  for (const binPath of ['bin/maestro-install-codex.js', 'bin/maestro-mcp-server.js']) {
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

module.exports = {
  DENIED_ARTIFACT_PATHS,
  DENIED_ARTIFACT_PATTERNS,
  RELEASE_ARTIFACT_PATHS,
  REQUIRED_PACKAGE_FILES,
  RUNTIME_SOURCE_PATHS,
  assertReleaseArtifactContents,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  assertVersionConsistency,
  getVersionEntries,
  isDeniedPath,
  isReleaseArtifactPathAllowed,
  requireString,
  readJson,
  toPosixPath,
};
