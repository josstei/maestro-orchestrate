'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RELEASE_ARTIFACT_PATHS = [
  '.agents/plugins/marketplace.json',
  '.claude-plugin/marketplace.json',
  'CHANGELOG.md',
  'EXAMPLES.md',
  'GEMINI.md',
  'LICENSE',
  'QWEN.md',
  'README.md',
  'agents',
  'bin',
  'claude',
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
  'plugins/maestro',
  'policies',
  'qwen',
  'qwen-extension.json',
  'src',
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
  'tests',
  'tmp',
  'temp',
  'hooks/permissions.json',
];

const DENIED_ARTIFACT_PATTERNS = [
  /(^|\/)__tests__(\/|$)/,
  /\.spec\.[cm]?js$/,
  /\.test\.[cm]?js$/,
];

const REQUIRED_PACKAGE_FILES = [
  'bin/maestro-mcp-server.js',
  'claude/.claude-plugin/plugin.json',
  'gemini-extension.json',
  'plugins/maestro/.codex-plugin/plugin.json',
  'qwen-extension.json',
  'src/mcp/maestro-server.js',
];

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

function assertRequiredArtifactPaths(root) {
  const missing = [];

  for (const relativePath of RELEASE_ARTIFACT_PATHS) {
    if (isDeniedPath(relativePath)) {
      throw new Error(`Release artifact allowlist contains denied path: ${relativePath}`);
    }

    if (!fs.existsSync(path.join(root, relativePath))) {
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
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${relativePath}: ${error.message}`);
  }
}

function requireNonEmpty(value, label, kind = 'version') {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing ${kind} value for ${label}`);
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

function assertRuntimeManifestShape(root, expectedVersion = null) {
  const pkg = readJson(root, 'package.json');
  const gemini = readJson(root, 'gemini-extension.json');
  const qwen = readJson(root, 'qwen-extension.json');
  const claudePlugin = readJson(root, 'claude/.claude-plugin/plugin.json');
  const codexPlugin = readJson(root, 'plugins/maestro/.codex-plugin/plugin.json');
  const claudeMarketplace = readJson(root, '.claude-plugin/marketplace.json');
  const claudeSrcVersion = readJson(root, 'claude/src/version.json');
  const codexSrcVersion = readJson(root, 'plugins/maestro/src/version.json');
  const claudeMarketplacePlugin = findNamedPlugin(
    claudeMarketplace,
    'maestro',
    '.claude-plugin/marketplace.json'
  );

  const versionEntries = [
    ['package.json', requireNonEmpty(pkg.version, 'package.json')],
    ['gemini-extension.json', requireNonEmpty(gemini.version, 'gemini-extension.json')],
    ['qwen-extension.json', requireNonEmpty(qwen.version, 'qwen-extension.json')],
    ['claude/.claude-plugin/plugin.json', requireNonEmpty(claudePlugin.version, 'claude plugin')],
    ['plugins/maestro/.codex-plugin/plugin.json', requireNonEmpty(codexPlugin.version, 'Codex plugin')],
    ['.claude-plugin/marketplace.json metadata.version', requireNonEmpty(claudeMarketplace.metadata && claudeMarketplace.metadata.version, 'Claude marketplace metadata')],
    ['.claude-plugin/marketplace.json plugins.maestro.version', requireNonEmpty(claudeMarketplacePlugin.version, 'Claude marketplace plugin')],
    ['claude/src/version.json', requireNonEmpty(claudeSrcVersion.version, 'Claude detached payload')],
    ['plugins/maestro/src/version.json', requireNonEmpty(codexSrcVersion.version, 'Codex detached payload')],
  ];
  const version = expectedVersion || versionEntries[0][1];
  const mismatches = versionEntries.filter(([, entryVersion]) => entryVersion !== version);

  if (mismatches.length > 0) {
    const details = mismatches.map(([label, entryVersion]) => `${label}=${entryVersion}`).join(', ');
    throw new Error(`Release manifest version mismatch; expected ${version}: ${details}`);
  }

  const codexMarketplace = readJson(root, '.agents/plugins/marketplace.json');
  const claudeMcp = readJson(root, 'claude/.mcp.json');
  const codexMcp = readJson(root, 'plugins/maestro/.mcp.json');

  const packageName = requireNonEmpty(pkg.name, 'package.json name', 'string');

  if (claudeMarketplacePlugin.source !== './claude') {
    throw new Error('.claude-plugin/marketplace.json maestro source must be ./claude');
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

  if (claudePlugin.hooks !== './hooks/claude-hooks.json') {
    throw new Error('claude plugin manifest must reference ./hooks/claude-hooks.json');
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
    !claudeServer.args.includes('${CLAUDE_PLUGIN_ROOT}/mcp/maestro-server.js')
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
    'bin/maestro-mcp-server.js',
    'claude/src/mcp/maestro-server.js',
    'plugins/maestro/src/mcp/maestro-server.js',
  ];

  for (const relativePath of requiredRuntimeFiles) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      throw new Error(`Required runtime file missing: ${relativePath}`);
    }
  }

  const binMode = fs.statSync(path.join(root, 'bin/maestro-mcp-server.js')).mode;
  if ((binMode & 0o111) === 0) {
    throw new Error('bin/maestro-mcp-server.js must be executable');
  }

  return version;
}

module.exports = {
  DENIED_ARTIFACT_PATHS,
  RELEASE_ARTIFACT_PATHS,
  REQUIRED_PACKAGE_FILES,
  assertReleaseArtifactContents,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  isDeniedPath,
  isReleaseArtifactPathAllowed,
  readJson,
  toPosixPath,
};
