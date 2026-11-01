'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isBuildOnly } = require('../src/generator/build-only');

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
  'scripts/lib/cli.js',
  'src/mcp/maestro-server.js',
  'src/platforms/metadata.js',
  'src/platforms/qwen/policy-pack.js',
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

// Manifests that launch the bundled server with node, by their root variable.
const NODE_LAUNCHERS = [
  ['antigravity/mcp_config.json', '${PLUGIN_ROOT}'],
  ['claude/.mcp.json', '${CLAUDE_PLUGIN_ROOT}'],
  ['qwen-extension.json', '${extensionPath}'],
];

// Returns `value`, so a check can also bind what it checked.
function ensure(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function ensureNone(offenders, message) {
  ensure(offenders.length === 0, `${message}: ${offenders.join(', ')}`);
}

/** Run a synchronous operation in a scratch directory, cleaning up on every exit. */
function withTempDir(prefix, operation) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return operation(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function releaseArchivePath(root, version, outDir) {
  return path.resolve(root, outDir || 'dist/release', `maestro-v${version}-extension.tar.gz`);
}

function normalizeArtifactPath(relativePath) {
  return relativePath.split(path.sep).join('/').replace(/\/+$/, '');
}

function isDeniedPath(relativePath) {
  const normalized = normalizeArtifactPath(relativePath);
  const deniedByPath = DENIED_ARTIFACT_PATHS.some((denied) => `/${normalized}/`.includes(`/${denied}/`));

  return deniedByPath || DENIED_ARTIFACT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isReleaseArtifactPathAllowed(relativePath) {
  const normalized = normalizeArtifactPath(relativePath);

  // The extension archive has no build CLI or Codex installer.
  if (normalized.startsWith('src/') && isBuildOnly(normalized.slice(4))) {
    return false;
  }

  return RELEASE_ARTIFACT_PATHS.some((allowed) => `${normalized}/`.startsWith(`${allowed}/`)
    || allowed.startsWith(`${normalized}/`));
}

function assertRequiredArtifactPaths(root) {
  const missing = RELEASE_ARTIFACT_PATHS.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));
  ensureNone(missing, 'Required release artifact paths are missing');
}

function walkArtifactFiles(root, relativeDir = '') {
  return fs.readdirSync(path.join(root, relativeDir), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDir, entry.name);
    ensure(!entry.isSymbolicLink(), `Release artifact contains symbolic link: ${relativePath}`);
    return entry.isDirectory() ? [relativePath, ...walkArtifactFiles(root, relativePath)] : [relativePath];
  });
}

function assertReleaseArtifactContents(root) {
  const files = walkArtifactFiles(root).sort();
  ensureNone(files.filter(isDeniedPath), 'Release artifact contains denied paths');
  // Denied paths already failed, so every remaining offender is merely unallowlisted.
  const unexpected = files.filter((relativePath) => !isReleaseArtifactPathAllowed(relativePath));
  ensureNone(unexpected, 'Release artifact contains unallowlisted paths');
}

function readJson(root, relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${relativePath}: ${error.message}`);
  }
}

function requireNonEmpty(value, label, kind = 'version') {
  return ensure(typeof value === 'string' && value, `Missing ${kind} value for ${label}`);
}

function findMaestroPlugin(marketplace, relativePath) {
  ensure(Array.isArray(marketplace.plugins), `${relativePath} must contain a plugins array`);
  return ensure(marketplace.plugins.find((entry) => entry && entry.name === 'maestro'),
    `${relativePath} missing plugin entry "maestro"`);
}

function assertLaunchesMaestroServer(mcpConfig, command, requiredArgs, message) {
  const server = (mcpConfig.mcpServers && mcpConfig.mcpServers.maestro) || {};
  ensure(server.command === command && Array.isArray(server.args)
    && requiredArgs.every((arg) => server.args.includes(arg)), message);
}

function assertRuntimeManifestShape(root, expectedVersion = null) {
  const pkg = readJson(root, 'package.json');
  const antigravityPlugin = readJson(root, 'antigravity/plugin.json');
  const qwen = readJson(root, 'qwen-extension.json');
  const claudePlugin = readJson(root, 'claude/.claude-plugin/plugin.json');
  const codexPlugin = readJson(root, 'plugins/maestro/.codex-plugin/plugin.json');
  const claudeMarketplace = readJson(root, '.claude-plugin/marketplace.json');
  const claudeMarketplacePlugin = findMaestroPlugin(claudeMarketplace, '.claude-plugin/marketplace.json');

  const versionEntries = [
    ['package.json', requireNonEmpty(pkg.version, 'package.json')],
    ['antigravity/plugin.json', requireNonEmpty(antigravityPlugin.version, 'Antigravity plugin')],
    ['qwen-extension.json', requireNonEmpty(qwen.version, 'qwen-extension.json')],
    ['claude/.claude-plugin/plugin.json', requireNonEmpty(claudePlugin.version, 'claude plugin')],
    ['plugins/maestro/.codex-plugin/plugin.json', requireNonEmpty(codexPlugin.version, 'Codex plugin')],
    ['.claude-plugin/marketplace.json metadata.version', requireNonEmpty(claudeMarketplace.metadata && claudeMarketplace.metadata.version, 'Claude marketplace metadata')],
    ['.claude-plugin/marketplace.json plugins.maestro.version', requireNonEmpty(claudeMarketplacePlugin.version, 'Claude marketplace plugin')],
    ['antigravity/src/version.json', requireNonEmpty(readJson(root, 'antigravity/src/version.json').version, 'Antigravity detached payload')],
    ['claude/src/version.json', requireNonEmpty(readJson(root, 'claude/src/version.json').version, 'Claude detached payload')],
    ['plugins/maestro/src/version.json', requireNonEmpty(readJson(root, 'plugins/maestro/src/version.json').version, 'Codex detached payload')],
  ];
  const version = expectedVersion || versionEntries[0][1];
  const mismatches = versionEntries.filter(([, entryVersion]) => entryVersion !== version);
  ensureNone(mismatches.map(([label, entryVersion]) => `${label}=${entryVersion}`),
    `Release manifest version mismatch; expected ${version}`);

  const codexMarketplace = readJson(root, '.agents/plugins/marketplace.json');
  const codexMcp = readJson(root, 'plugins/maestro/.mcp.json');

  const packageName = requireNonEmpty(pkg.name, 'package.json name', 'string');

  ensure(claudeMarketplacePlugin.source === './claude',
    '.claude-plugin/marketplace.json maestro source must be ./claude');
  const codexSource = findMaestroPlugin(codexMarketplace, '.agents/plugins/marketplace.json').source || {};
  ensure(codexSource.source === 'local' && codexSource.path === './plugins/maestro',
    '.agents/plugins/marketplace.json maestro source must be local ./plugins/maestro');
  ensure(qwen.contextFileName === 'QWEN.md' && qwen.mcpServers && qwen.mcpServers.maestro,
    'qwen-extension.json must define QWEN.md and maestro MCP server');
  ensure(claudePlugin.hooks === './hooks/claude-hooks.json',
    'claude plugin manifest must reference ./hooks/claude-hooks.json');
  const { skills, mcpServers, apps } = codexPlugin;
  ensure(skills === './skills/' && mcpServers === './.mcp.json' && apps === './.app.json',
    'Codex plugin manifest must reference skills, MCP, and app config files');
  ensure(antigravityPlugin.name === 'maestro', 'antigravity/plugin.json must name the plugin maestro');

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
    ensure(fs.existsSync(absolutePath), `Required runtime file missing: ${relativePath}`);
    ensure(fs.statSync(absolutePath).isFile(), `Required runtime file must be a regular file: ${relativePath}`);
  }

  const binMode = fs.statSync(path.join(root, 'bin/maestro-mcp-server.js')).mode;
  ensure(binMode & 0o111, 'bin/maestro-mcp-server.js must be executable');

  return version;
}

// Packaging checks its staged tree, and verification its extracted archive, by the same rules.
function assertReleaseArtifact(root, expectedVersion = null) {
  assertRequiredArtifactPaths(root);
  assertReleaseArtifactContents(root);
  return assertRuntimeManifestShape(root, expectedVersion);
}

module.exports = {
  DENIED_ARTIFACT_PATHS,
  RELEASE_ARTIFACT_PATHS,
  REQUIRED_PACKAGE_FILES,
  assertReleaseArtifact,
  assertReleaseArtifactContents,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  ensure,
  ensureNone,
  isDeniedPath,
  isReleaseArtifactPathAllowed,
  readJson,
  releaseArchivePath,
  requireNonEmpty,
  withTempDir,
};
