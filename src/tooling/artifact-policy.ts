const ARTIFACT_SCOPE = Object.freeze({
  BOTH: 'both',
  NPM: 'npm',
  RELEASE: 'release',
});

type ArtifactScope = (typeof ARTIFACT_SCOPE)[keyof typeof ARTIFACT_SCOPE];

type ArtifactInventoryEntry = Readonly<{
  path: string;
  scope: ArtifactScope;
}>;

type PackageBudget = Readonly<{
  id: string;
  maxEntryCount: number;
  maxPackedSize: number;
  maxUnpackedSize: number;
}>;

type PackageSurfaceRule = Readonly<{
  id: string;
  exact?: readonly string[];
  prefixes?: readonly string[];
}>;

type PrivateScriptRole = Readonly<{
  role: 'dev-only' | 'release-only';
  note: string;
}>;

const RUNTIME_DIST_PATHS = Object.freeze([
  'dist/src/bin/maestro-install-codex.js',
  'dist/src/bin/maestro-mcp-server.js',
  'dist/src/config',
  'dist/src/core',
  'dist/src/generated',
  'dist/src/hooks',
  'dist/src/lib/errors',
  'dist/src/lib/framework-detection.js',
  'dist/src/lib/frontmatter',
  'dist/src/lib/io',
  'dist/src/lib/naming',
  'dist/src/lib/validation',
  'dist/src/mcp',
  'dist/src/platforms/claude/runtime-config.js',
  'dist/src/platforms/codex/runtime-config.js',
  'dist/src/platforms/gemini/runtime-config.js',
  'dist/src/platforms/qwen/runtime-config.js',
  'dist/src/platforms/shared/adapters',
  'dist/src/platforms/shared/gemini-family-config.js',
  'dist/src/platforms/shared/hook-runner.js',
  'dist/src/state',
]);

const RUNTIME_DIST_ENTRIES: readonly ArtifactInventoryEntry[] = RUNTIME_DIST_PATHS.map((path) => ({
  path,
  scope: ARTIFACT_SCOPE.BOTH,
}));

const NPM_PACKAGE_EXCLUSION_ENTRIES: readonly ArtifactInventoryEntry[] = [
  { path: '!dist/src/**/*.d.ts', scope: ARTIFACT_SCOPE.NPM },
  { path: '!dist/src/**/*.d.ts.map', scope: ARTIFACT_SCOPE.NPM },
  { path: '!dist/src/**/*.map', scope: ARTIFACT_SCOPE.NPM },
];

const PACKAGE_SURFACE_ENTRIES: readonly ArtifactInventoryEntry[] = [
  { path: 'agents', scope: ARTIFACT_SCOPE.BOTH },
  { path: '.claude-plugin/marketplace.json', scope: ARTIFACT_SCOPE.BOTH },
  { path: '.claude-plugin/plugin.json', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'claude/.mcp.json', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'claude/README.md', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'claude/agents', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'claude/hooks', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'claude/mcp-config.example.json', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'claude/mcp', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'claude/scripts', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'claude/skills', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'plugins/maestro/.app.json', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'plugins/maestro/.codex-plugin', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'plugins/maestro/.mcp.json', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'plugins/maestro/README.md', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'plugins/maestro/references', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'plugins/maestro/skills', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'commands', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'hooks', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'mcp', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'policies', scope: ARTIFACT_SCOPE.BOTH },
  { path: '.agents/plugins/marketplace.json', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'GEMINI.md', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'gemini-extension.json', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'QWEN.md', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'qwen-extension.json', scope: ARTIFACT_SCOPE.BOTH },
  { path: 'qwen', scope: ARTIFACT_SCOPE.BOTH },
];

const RELEASE_DOC_ENTRIES: readonly ArtifactInventoryEntry[] = [
  { path: 'CHANGELOG.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'EXAMPLES.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'docs/architecture.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'docs/cicd.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'docs/flow.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'docs/maestro-cheatsheet.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'docs/overview.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'docs/runtime-claude.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'docs/runtime-codex.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'docs/runtime-gemini.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'docs/runtime-qwen.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'docs/usage.md', scope: ARTIFACT_SCOPE.RELEASE },
];

const RELEASE_ONLY_ENTRIES: readonly ArtifactInventoryEntry[] = [
  { path: 'LICENSE', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'README.md', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'package.json', scope: ARTIFACT_SCOPE.RELEASE },
  { path: 'package-lock.json', scope: ARTIFACT_SCOPE.RELEASE },
];

const ARTIFACT_INVENTORY = Object.freeze(
  [
    ...RUNTIME_DIST_ENTRIES,
    ...NPM_PACKAGE_EXCLUSION_ENTRIES,
    ...PACKAGE_SURFACE_ENTRIES,
    ...RELEASE_DOC_ENTRIES,
    ...RELEASE_ONLY_ENTRIES,
  ].map((entry) => Object.freeze({ ...entry }))
);

const DENIED_ARTIFACT_PATHS = Object.freeze([
  '.git',
  '.github',
  '.gemini',
  '.gemini_security',
  '.claude',
  '.worktrees',
  '.serena',
  '.superpowers',
  'bin',
  'coverage',
  'dist/claude-plugin',
  'dist/release',
  'dist/src/entry-points',
  'dist/src/generator',
  'dist/src/lib/discovery',
  'dist/src/lib/yaml-emit.js',
  'dist/src/manifest.js',
  'dist/src/platforms/metadata-shared.js',
  'dist/src/platforms/metadata.js',
  'dist/src/platforms/runtime-payload-contract.js',
  'dist/src/tooling',
  'dist/src/transforms',
  'docs/maestro',
  'docs/superpowers',
  'node_modules',
  'scripts',
  'src',
  'tests',
  'tmp',
  'temp',
  'hooks/permissions.json',
  'claude/src',
  'plugins/maestro/src',
]);

const DENIED_ARTIFACT_PATTERNS = Object.freeze([
  /(^|\/)__tests__(\/|$)/,
  /(^|\/)[^/]+\.d\.ts$/,
  /(^|\/)[^/]+\.d\.ts\.map$/,
  /(^|\/)[^/]+\.map$/,
  /^dist\/src\/platforms\/[^/]+\/metadata\.js$/,
  /\.spec\.[cm]?js$/,
  /\.test\.[cm]?js$/,
]);

const RUNTIME_PACKAGE_INVARIANTS = Object.freeze({
  gemini: Object.freeze([
    'dist/src/bin/maestro-mcp-server.js',
    'dist/src/generated/runtime-content-registry.json',
    'dist/src/generated/runtime-content-registry.txt.gz',
    'dist/src/mcp/maestro-server.js',
    'gemini-extension.json',
    'mcp/maestro-server.js',
  ]),
  claude: Object.freeze([
    '.claude-plugin/plugin.json',
    'claude/.mcp.json',
    'claude/mcp/maestro-server.js',
    'dist/src/bin/maestro-mcp-server.js',
    'dist/src/generated/runtime-content-registry.json',
    'dist/src/generated/runtime-content-registry.txt.gz',
    'dist/src/mcp/maestro-server.js',
  ]),
  codex: Object.freeze([
    'dist/src/bin/maestro-install-codex.js',
    'dist/src/bin/maestro-mcp-server.js',
    'dist/src/generated/runtime-content-registry.json',
    'dist/src/generated/runtime-content-registry.txt.gz',
    'dist/src/mcp/maestro-server.js',
    'plugins/maestro/.codex-plugin/plugin.json',
    'plugins/maestro/.mcp.json',
  ]),
  qwen: Object.freeze([
    'dist/src/bin/maestro-mcp-server.js',
    'dist/src/generated/runtime-content-registry.json',
    'dist/src/generated/runtime-content-registry.txt.gz',
    'dist/src/mcp/maestro-server.js',
    'qwen-extension.json',
    'qwen/hooks.json',
    'mcp/maestro-server.js',
  ]),
});

const REQUIRED_PACKAGE_FILES = Object.freeze(
  [...new Set(Object.values(RUNTIME_PACKAGE_INVARIANTS).flat())].sort()
);

const FINAL_PACKAGE_BUDGETS: PackageBudget = Object.freeze({
  id: 'final-compressed-pruned',
  maxEntryCount: 340,
  maxPackedSize: 330000,
  maxUnpackedSize: 850000,
});

const PACKAGE_BUDGETS = Object.freeze({
  ...FINAL_PACKAGE_BUDGETS,
  final: FINAL_PACKAGE_BUDGETS,
});

const PRIVATE_SCRIPT_ROLES: Readonly<Record<string, PrivateScriptRole>> = Object.freeze({
  'src/tooling/check-esm-imports.ts': {
    role: 'dev-only',
    note: 'Local and CI ESM import-specifier gate; private to source checkouts.',
  },
  'src/tooling/check-layer-boundaries.ts': {
    role: 'dev-only',
    note: 'Local and CI layer-boundary gate; private to source checkouts.',
  },
  'src/tooling/generate.ts': {
    role: 'release-only',
    note: 'Prepack generation entrypoint; private to source checkouts and release workflows.',
  },
  'src/tooling/install-git-hooks.ts': {
    role: 'dev-only',
    note: 'Source checkout setup helper; private to source checkouts.',
  },
  'src/tooling/local-artifact-retention.ts': {
    role: 'dev-only',
    note: 'Ignored local state inventory and explicit-prune helper; private to source checkouts.',
  },
  'src/tooling/npm-publish-idempotent.ts': {
    role: 'release-only',
    note: 'Release workflow support; private to source checkouts.',
  },
  'src/tooling/package-release-artifacts.ts': {
    role: 'release-only',
    note: 'Release artifact packaging support; private to source checkouts.',
  },
  'src/tooling/publish-dist-branch.ts': {
    role: 'release-only',
    note: 'Generated dist branch snapshot publisher; private to source checkouts and release workflows.',
  },
  'src/tooling/release-artifact-manifest.ts': {
    role: 'release-only',
    note: 'Release and package artifact contract shared by source-checkout verifiers.',
  },
  'src/tooling/release-version-metadata.ts': {
    role: 'release-only',
    note: 'Release version metadata support; private to source checkouts.',
  },
  'src/tooling/update-versions.ts': {
    role: 'release-only',
    note: 'Version stamping support; private to source checkouts.',
  },
  'src/tooling/verify-npm-pack.ts': {
    role: 'release-only',
    note: 'Package inventory verification support; private to source checkouts.',
  },
  'src/tooling/verify-release-artifacts.ts': {
    role: 'release-only',
    note: 'Release artifact verification support; private to source checkouts.',
  },
});

function projectByScopes(scopes: readonly ArtifactScope[]): readonly string[] {
  return Object.freeze(
    [...new Set(ARTIFACT_INVENTORY.filter((entry) => scopes.includes(entry.scope)).map((entry) => entry.path))].sort()
  );
}

function npmFiles(): readonly string[] {
  return projectByScopes([ARTIFACT_SCOPE.BOTH, ARTIFACT_SCOPE.NPM]);
}

function releasePaths(): readonly string[] {
  return projectByScopes([ARTIFACT_SCOPE.BOTH, ARTIFACT_SCOPE.RELEASE]);
}

function pickInventoryPaths(...paths: string[]): readonly string[] {
  const releaseInventory = releasePaths();

  for (const inventoryPath of paths) {
    if (!releaseInventory.includes(inventoryPath)) {
      throw new Error(
        `Package surface rule references a path missing from the artifact inventory: ${inventoryPath}`
      );
    }
  }

  return Object.freeze(paths);
}

function isFilePath(artifactPath: string): boolean {
  return /\.[^/]+$/.test(artifactPath);
}

function buildRuntimeDistPackageRule(): PackageSurfaceRule {
  const exact: string[] = [];
  const prefixes: string[] = [];

  for (const runtimeDistPath of RUNTIME_DIST_PATHS) {
    if (isFilePath(runtimeDistPath)) {
      exact.push(runtimeDistPath);
    } else {
      prefixes.push(`${runtimeDistPath}/`);
    }
  }

  return Object.freeze({
    id: 'runtime-dist',
    exact: Object.freeze(exact),
    prefixes: Object.freeze(prefixes),
  });
}

const PACKAGE_SURFACE_RULES: readonly PackageSurfaceRule[] = Object.freeze([
  {
    id: 'package-metadata',
    exact: pickInventoryPaths(
      'package.json',
      'README.md',
      'LICENSE'
    ),
  },
  {
    id: 'runtime-docs',
    exact: pickInventoryPaths(
      'GEMINI.md',
      'QWEN.md',
      'claude/README.md',
      'plugins/maestro/README.md'
    ),
  },
  {
    id: 'public-bin',
    exact: pickInventoryPaths(
      'dist/src/bin/maestro-install-codex.js',
      'dist/src/bin/maestro-mcp-server.js'
    ),
  },
  {
    id: 'root-runtime-metadata',
    exact: pickInventoryPaths(
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      '.claude-plugin/plugin.json',
      'gemini-extension.json',
      'qwen-extension.json'
    ),
  },
  {
    id: 'root-generated-runtime',
    prefixes: ['agents/', 'commands/', 'hooks/', 'mcp/', 'policies/'],
  },
  {
    id: 'claude-runtime',
    exact: [
      'claude/.mcp.json',
      'claude/README.md',
      'claude/hooks/claude-hooks.json',
      'claude/mcp-config.example.json',
      'claude/mcp/maestro-server.js',
    ],
    prefixes: [
      'claude/agents/',
      'claude/scripts/',
      'claude/skills/',
    ],
  },
  {
    id: 'codex-runtime',
    exact: [
      'plugins/maestro/.app.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'plugins/maestro/README.md',
    ],
    prefixes: [
      'plugins/maestro/references/',
      'plugins/maestro/skills/',
    ],
  },
  {
    id: 'qwen-runtime',
    exact: ['qwen/hooks.json'],
    prefixes: ['qwen/agents/'],
  },
  buildRuntimeDistPackageRule(),
]);

function runtimePackageInvariants(runtimeName: keyof typeof RUNTIME_PACKAGE_INVARIANTS): readonly string[] {
  return RUNTIME_PACKAGE_INVARIANTS[runtimeName];
}

export {
  ARTIFACT_SCOPE,
  ARTIFACT_INVENTORY,
  DENIED_ARTIFACT_PATHS,
  DENIED_ARTIFACT_PATTERNS,
  FINAL_PACKAGE_BUDGETS,
  PACKAGE_BUDGETS,
  PACKAGE_SURFACE_RULES,
  PRIVATE_SCRIPT_ROLES,
  REQUIRED_PACKAGE_FILES,
  RUNTIME_DIST_PATHS,
  RUNTIME_PACKAGE_INVARIANTS,
  npmFiles,
  releasePaths,
  runtimePackageInvariants,
};

export type { ArtifactInventoryEntry, ArtifactScope, PackageBudget, PackageSurfaceRule };
