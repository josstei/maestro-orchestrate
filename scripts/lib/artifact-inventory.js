'use strict';

const SCOPE = Object.freeze({
  BOTH: 'both',
  NPM: 'npm',
  RELEASE: 'release',
});

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
  'src/lib/schema',
  'src/lib/validation',
  'src/mcp',
  'src/platforms/claude/runtime-config.js',
  'src/platforms/codex/runtime-config.js',
  'src/platforms/gemini/runtime-config.js',
  'src/platforms/qwen/runtime-config.js',
  'src/platforms/shared/adapters',
  'src/platforms/shared/gemini-family-config.js',
  'src/platforms/shared/hook-runner.js',
  'src/references',
  'src/skills',
  'src/state',
  'src/templates',
]);

const RUNTIME_SOURCE_ENTRIES = RUNTIME_SOURCE_PATHS.map((path) => ({ path, scope: SCOPE.BOTH }));

const PACKAGE_SURFACE_ENTRIES = [
  { path: 'EXAMPLES.md', scope: SCOPE.BOTH },
  { path: 'bin', scope: SCOPE.NPM },
  { path: 'agents', scope: SCOPE.BOTH },
  { path: '.claude-plugin/marketplace.json', scope: SCOPE.BOTH },
  { path: '.claude-plugin/plugin.json', scope: SCOPE.BOTH },
  { path: 'claude/.mcp.json', scope: SCOPE.BOTH },
  { path: 'claude/README.md', scope: SCOPE.BOTH },
  { path: 'claude/agents', scope: SCOPE.BOTH },
  { path: 'claude/hooks', scope: SCOPE.BOTH },
  { path: 'claude/mcp-config.example.json', scope: SCOPE.BOTH },
  { path: 'claude/mcp', scope: SCOPE.BOTH },
  { path: 'claude/scripts', scope: SCOPE.BOTH },
  { path: 'claude/skills', scope: SCOPE.BOTH },
  { path: 'plugins/maestro/.app.json', scope: SCOPE.BOTH },
  { path: 'plugins/maestro/.codex-plugin', scope: SCOPE.BOTH },
  { path: 'plugins/maestro/.mcp.json', scope: SCOPE.BOTH },
  { path: 'plugins/maestro/README.md', scope: SCOPE.BOTH },
  { path: 'plugins/maestro/references', scope: SCOPE.BOTH },
  { path: 'plugins/maestro/skills', scope: SCOPE.BOTH },
  { path: 'commands', scope: SCOPE.BOTH },
  { path: 'hooks', scope: SCOPE.BOTH },
  { path: 'mcp', scope: SCOPE.BOTH },
  { path: 'policies', scope: SCOPE.BOTH },
  { path: 'docs/architecture.md', scope: SCOPE.BOTH },
  { path: 'docs/cicd.md', scope: SCOPE.BOTH },
  { path: 'docs/flow.md', scope: SCOPE.BOTH },
  { path: 'docs/maestro-cheatsheet.md', scope: SCOPE.BOTH },
  { path: 'docs/overview.md', scope: SCOPE.BOTH },
  { path: 'docs/runtime-claude.md', scope: SCOPE.BOTH },
  { path: 'docs/runtime-codex.md', scope: SCOPE.BOTH },
  { path: 'docs/runtime-gemini.md', scope: SCOPE.BOTH },
  { path: 'docs/runtime-qwen.md', scope: SCOPE.BOTH },
  { path: 'docs/usage.md', scope: SCOPE.BOTH },
  { path: '.agents/plugins/marketplace.json', scope: SCOPE.BOTH },
  { path: 'GEMINI.md', scope: SCOPE.BOTH },
  { path: 'gemini-extension.json', scope: SCOPE.BOTH },
  { path: 'QWEN.md', scope: SCOPE.BOTH },
  { path: 'qwen-extension.json', scope: SCOPE.BOTH },
  { path: 'qwen', scope: SCOPE.BOTH },
  { path: 'CHANGELOG.md', scope: SCOPE.BOTH },
];

const RELEASE_ONLY_ENTRIES = [
  { path: 'LICENSE', scope: SCOPE.RELEASE },
  { path: 'README.md', scope: SCOPE.RELEASE },
  { path: 'package.json', scope: SCOPE.RELEASE },
  { path: 'package-lock.json', scope: SCOPE.RELEASE },
  { path: 'bin/maestro-install-codex.js', scope: SCOPE.RELEASE },
  { path: 'bin/maestro-mcp-server.js', scope: SCOPE.RELEASE },
];

const INVENTORY = Object.freeze(
  [...RUNTIME_SOURCE_ENTRIES, ...PACKAGE_SURFACE_ENTRIES, ...RELEASE_ONLY_ENTRIES].map((entry) =>
    Object.freeze({ ...entry })
  )
);

function projectByScopes(scopes) {
  return Object.freeze(
    [...new Set(INVENTORY.filter((entry) => scopes.includes(entry.scope)).map((entry) => entry.path))].sort()
  );
}

function npmFiles() {
  return projectByScopes([SCOPE.BOTH, SCOPE.NPM]);
}

function releasePaths() {
  return projectByScopes([SCOPE.BOTH, SCOPE.RELEASE]);
}

module.exports = {
  SCOPE,
  INVENTORY,
  RUNTIME_SOURCE_PATHS,
  npmFiles,
  releasePaths,
};
