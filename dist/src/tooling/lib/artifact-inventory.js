const SCOPE = Object.freeze({
    BOTH: 'both',
    NPM: 'npm',
    RELEASE: 'release',
});
const RUNTIME_DIST_PATHS = Object.freeze([
    'dist/src/bin/maestro-install-codex.js',
    'dist/src/bin/maestro-mcp-server.js',
    'dist/src/agents',
    'dist/src/config',
    'dist/src/core',
    'dist/src/generated',
    'dist/src/hooks',
    'dist/src/lib/errors',
    'dist/src/lib/framework-detection.js',
    'dist/src/lib/frontmatter',
    'dist/src/lib/io',
    'dist/src/lib/naming',
    'dist/src/lib/schema',
    'dist/src/lib/validation',
    'dist/src/mcp',
    'dist/src/platforms/claude/runtime-config.js',
    'dist/src/platforms/codex/runtime-config.js',
    'dist/src/platforms/gemini/runtime-config.js',
    'dist/src/platforms/qwen/runtime-config.js',
    'dist/src/platforms/shared/adapters',
    'dist/src/platforms/shared/gemini-family-config.js',
    'dist/src/platforms/shared/hook-runner.js',
    'dist/src/references',
    'dist/src/skills',
    'dist/src/state',
    'dist/src/templates',
]);
const RUNTIME_DIST_ENTRIES = RUNTIME_DIST_PATHS.map((path) => ({ path, scope: SCOPE.BOTH }));
const NPM_PACKAGE_EXCLUSION_ENTRIES = [
    { path: '!dist/src/**/*.d.ts', scope: SCOPE.NPM },
    { path: '!dist/src/**/*.d.ts.map', scope: SCOPE.NPM },
    { path: '!dist/src/**/*.map', scope: SCOPE.NPM },
];
const PACKAGE_SURFACE_ENTRIES = [
    { path: 'EXAMPLES.md', scope: SCOPE.BOTH },
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
];
const INVENTORY = Object.freeze([...RUNTIME_DIST_ENTRIES, ...NPM_PACKAGE_EXCLUSION_ENTRIES, ...PACKAGE_SURFACE_ENTRIES, ...RELEASE_ONLY_ENTRIES].map((entry) => Object.freeze({ ...entry })));
function projectByScopes(scopes) {
    return Object.freeze([...new Set(INVENTORY.filter((entry) => scopes.includes(entry.scope)).map((entry) => entry.path))].sort());
}
function npmFiles() {
    return projectByScopes([SCOPE.BOTH, SCOPE.NPM]);
}
function releasePaths() {
    return projectByScopes([SCOPE.BOTH, SCOPE.RELEASE]);
}
export { SCOPE, INVENTORY, RUNTIME_DIST_PATHS, npmFiles, releasePaths };
