'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BUILD_ONLY_PATHS } = require('../src/generator/build-only');

const RELEASE_ARTIFACT_PATHS = [
  '.agents/plugins/marketplace.json',
  '.claude-plugin/marketplace.json',
  'CHANGELOG.md',
  'EXAMPLES.md',
  'LICENSE',
  'QWEN.md',
  'README.md',
  'agents',
  'antigravity',
  'bin',
  'claude',
  'commands',
  'docs/runtime-antigravity.md',
  'docs/runtime-claude.md',
  'docs/runtime-codex.md',
  'docs/runtime-qwen.md',
  'docs/usage.md',
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

// The extension archive has no build CLI. npm retains these sources for its
// generate/build/prepack commands and Codex installer.
const RELEASE_BUILD_EXCLUSIONS = BUILD_ONLY_PATHS.map((buildPath) => `src/${buildPath}`);

const DENIED_ARTIFACT_PATHS = [
  '.git',
  '.github',
  '.gemini',
  '.gemini_security',
  '.claude',
  '.worktrees',
  '.serena',
  '.superpowers',
  '.cache',
  'coverage',
  'dist',
  'docs/maestro',
  'docs/superpowers',
  'node_modules',
  'tests',
  'tmp',
  'temp',
  'scratch',
];

const DENIED_ARTIFACT_PATTERNS = [
  /(^|\/)__tests__(\/|$)/,
  /\.spec\.[cm]?js$/,
  /\.test\.[cm]?js$/,
];

const REQUIRED_PACKAGE_FILES = [
  'antigravity/plugin.json',
  'bin/maestro-mcp-server.js',
  'claude/.claude-plugin/plugin.json',
  'plugins/maestro/.codex-plugin/plugin.json',
  'qwen-extension.json',
  'scripts/install-codex-plugin.js',
  'src/mcp/maestro-server.js',
];

const REQUIRED_RUNTIME_FILES = [
  'antigravity/hooks/hook-runner.js',
  'antigravity/hooks/policy-enforcer.js',
  'antigravity/hooks.json',
  'antigravity/mcp/maestro-server.js',
  'antigravity/src/mcp/maestro-server.js',
  'bin/maestro-mcp-server.js',
  'claude/hooks/claude-hooks.json',
  'claude/mcp/maestro-server.js',
  'claude/scripts/hook-runner.js',
  'claude/scripts/policy-enforcer.js',
  'claude/src/mcp/maestro-server.js',
  'hooks/hook-runner.js',
  'mcp/maestro-server.js',
  'plugins/maestro/.app.json',
  'plugins/maestro/src/mcp/maestro-server.js',
  'qwen/hooks.json',
  'src/mcp/maestro-server.js',
];

// Runtime roots whose detached src/ payload carries its own version.json.
const DETACHED_PAYLOADS = [
  ['antigravity', 'Antigravity'],
  ['claude', 'Claude'],
  ['plugins/maestro', 'Codex'],
];

// Manifests that launch the bundled server with node, by their root variable.
const NODE_LAUNCHERS = [
  ['antigravity/mcp_config.json', '${PLUGIN_ROOT}'],
  ['claude/.mcp.json', '${CLAUDE_PLUGIN_ROOT}'],
  ['qwen-extension.json', '${extensionPath}'],
];

const RELEASE_OUT_DIR = 'dist/release';

function releaseArchiveName(version) {
  return `maestro-v${version}-extension.tar.gz`;
}

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
    return normalized === denied || normalized.startsWith(`${denied}/`)
      || normalized.endsWith(`/${denied}`) || normalized.includes(`/${denied}/`);
  });

  return deniedByPath || DENIED_ARTIFACT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isReleaseArtifactPathAllowed(relativePath) {
  const normalized = normalizeArtifactPath(relativePath);

  if (!normalized) {
    return true;
  }

  if (RELEASE_BUILD_EXCLUSIONS.some((excluded) =>
    normalized === excluded || normalized.startsWith(`${excluded}/`))) {
    return false;
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
  const missing = RELEASE_ARTIFACT_PATHS.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));

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
      if (entry.isSymbolicLink()) {
        throw new Error(`Release artifact contains symbolic link: ${relativePath}`);
      }
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

function assertLaunchesMaestroServer(mcpConfig, command, requiredArgs, message) {
  const server = mcpConfig.mcpServers && mcpConfig.mcpServers.maestro;
  if (
    !server ||
    server.command !== command ||
    !Array.isArray(server.args) ||
    !requiredArgs.every((arg) => server.args.includes(arg))
  ) {
    throw new Error(message);
  }
}

function assertRuntimeManifestShape(root, expectedVersion = null) {
  const pkg = readJson(root, 'package.json');
  const antigravityPlugin = readJson(root, 'antigravity/plugin.json');
  const qwen = readJson(root, 'qwen-extension.json');
  const claudePlugin = readJson(root, 'claude/.claude-plugin/plugin.json');
  const codexPlugin = readJson(root, 'plugins/maestro/.codex-plugin/plugin.json');
  const claudeMarketplace = readJson(root, '.claude-plugin/marketplace.json');
  const claudeMarketplacePlugin = findNamedPlugin(
    claudeMarketplace,
    'maestro',
    '.claude-plugin/marketplace.json'
  );

  const versionEntries = [
    ['package.json', requireNonEmpty(pkg.version, 'package.json')],
    ['antigravity/plugin.json', requireNonEmpty(antigravityPlugin.version, 'Antigravity plugin')],
    ['qwen-extension.json', requireNonEmpty(qwen.version, 'qwen-extension.json')],
    ['claude/.claude-plugin/plugin.json', requireNonEmpty(claudePlugin.version, 'claude plugin')],
    ['plugins/maestro/.codex-plugin/plugin.json', requireNonEmpty(codexPlugin.version, 'Codex plugin')],
    ['.claude-plugin/marketplace.json metadata.version', requireNonEmpty(claudeMarketplace.metadata && claudeMarketplace.metadata.version, 'Claude marketplace metadata')],
    ['.claude-plugin/marketplace.json plugins.maestro.version', requireNonEmpty(claudeMarketplacePlugin.version, 'Claude marketplace plugin')],
    ...DETACHED_PAYLOADS.map(([runtimeRoot, runtime]) => {
      const relativePath = `${runtimeRoot}/src/version.json`;
      return [relativePath, requireNonEmpty(readJson(root, relativePath).version, `${runtime} detached payload`)];
    }),
  ];
  const version = expectedVersion || versionEntries[0][1];
  const mismatches = versionEntries.filter(([, entryVersion]) => entryVersion !== version);

  if (mismatches.length > 0) {
    const details = mismatches.map(([label, entryVersion]) => `${label}=${entryVersion}`).join(', ');
    throw new Error(`Release manifest version mismatch; expected ${version}: ${details}`);
  }

  const codexMarketplace = readJson(root, '.agents/plugins/marketplace.json');
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

  if (antigravityPlugin.name !== 'maestro') {
    throw new Error('antigravity/plugin.json must name the plugin maestro');
  }

  for (const [relativePath, rootVariable] of NODE_LAUNCHERS) {
    assertLaunchesMaestroServer(
      readJson(root, relativePath),
      'node',
      [`${rootVariable}/mcp/maestro-server.js`],
      `${relativePath} must launch the bundled Maestro MCP server`
    );
  }

  const expectedPackageSpec = `${packageName}@${version}`;
  assertLaunchesMaestroServer(
    codexMcp,
    'npx',
    ['-p', expectedPackageSpec, 'maestro-mcp-server'],
    `plugins/maestro/.mcp.json must launch ${expectedPackageSpec}`
  );

  for (const relativePath of REQUIRED_RUNTIME_FILES) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Required runtime file missing: ${relativePath}`);
    }
    if (!fs.statSync(absolutePath).isFile()) {
      throw new Error(`Required runtime file must be a regular file: ${relativePath}`);
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
  RELEASE_OUT_DIR,
  REQUIRED_PACKAGE_FILES,
  assertReleaseArtifactContents,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  isDeniedPath,
  isReleaseArtifactPathAllowed,
  readJson,
  releaseArchiveName,
  requireNonEmpty,
};
