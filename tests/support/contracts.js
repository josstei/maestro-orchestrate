import { readFileSync } from 'node:fs';
import { REPO_ROOT, repoPath } from './paths.js';

const ROOT = REPO_ROOT;
const packageJson = JSON.parse(readFileSync(repoPath('package.json')));

const VALID_ARTIFACT_SCOPES = new Set(['both', 'npm', 'release']);

const EXPECTED_RUNTIME_NAMES = Object.freeze(['claude', 'codex', 'gemini', 'qwen']);

const EXPECTED_REQUIRED_PACKAGE_FILES = Object.freeze([
  '.claude-plugin/plugin.json',
  'claude/.mcp.json',
  'claude/mcp/maestro-server.js',
  'dist/src/bin/maestro-install-codex.js',
  'dist/src/bin/maestro-mcp-server.js',
  'dist/src/generated/runtime-content-registry.json',
  'dist/src/generated/runtime-content-registry.txt.gz',
  'dist/src/mcp/handlers/session-state-core.js',
  'dist/src/mcp/handlers/session-state-tools.js',
  'dist/src/mcp/maestro-server.js',
  'dist/src/platforms/runtime-declarations.js',
  'gemini-extension.json',
  'mcp/maestro-server.js',
  'plugins/maestro/.codex-plugin/plugin.json',
  'plugins/maestro/.mcp.json',
  'qwen-extension.json',
  'qwen/hooks.json',
]);

const EXPECTED_PACKAGE_SCRIPT_LIFECYCLE = Object.freeze({
  'generate:run': 'node dist/src/tooling/generate.js',
  generate: 'npm run build && npm run generate:run',
  'test:run': 'node --test tests/unit/*.test.js tests/transforms/*.test.js tests/integration/*.test.js',
  test: 'npm run generate && npm run test:run',
  'check:source': 'npm run build && npm run generate:run && npm run typecheck:type-tests && git diff --exit-code --name-only && node dist/src/tooling/check-layer-boundaries.js && node dist/src/tooling/check-esm-imports.js && npm run test:run',
  'release:artifacts:run': 'node dist/src/tooling/package-release-artifacts.js --out-dir dist/release',
  'release:artifacts': 'npm run generate && npm run release:artifacts:run',
  'release:verify-artifacts:run': 'node dist/src/tooling/verify-release-artifacts.js',
  'release:verify-artifacts': 'npm run build && npm run release:verify-artifacts:run',
  'pack:verify:run': 'node dist/src/tooling/verify-npm-pack.js',
  'pack:verify': 'npm run build && npm run pack:verify:run',
  'check:release': 'npm run build && npm run generate:run && npm run pack:verify:run -- --ignore-scripts && npm run release:artifacts:run && npm run release:verify-artifacts:run',
  prepack: 'npm run generate',
});

const RELEASE_ONLY_PACKAGE_DOCS = [
  'CHANGELOG.md',
  'EXAMPLES.md',
  'docs/architecture.md',
  'docs/cicd.md',
  'docs/flow.md',
  'docs/maestro-cheatsheet.md',
  'docs/overview.md',
  'docs/runtime-payload-contract.md',
  'docs/runtime-claude.md',
  'docs/runtime-codex.md',
  'docs/runtime-gemini.md',
  'docs/runtime-qwen.md',
  'docs/usage.md',
];

const RAW_DIST_CONTENT_ROOTS = [
  'dist/src/agents',
  'dist/src/references',
  'dist/src/skills',
  'dist/src/templates',
];

const RAW_DIST_CONTENT_PATHS = [
  'dist/src/agents/coder.md',
  'dist/src/references/architecture.md',
  'dist/src/skills/shared/delegation/SKILL.md',
  'dist/src/templates/session-state.md',
];

const BUILD_ONLY_SOURCE_PATHS = [
  'src/generator/file-writer.ts',
  'src/transforms/index.ts',
  'src/entry-points/registry.ts',
  'src/lib/discovery/index.ts',
  'src/lib/yaml-emit.ts',
  'src/manifest.ts',
  'src/platforms/metadata.ts',
  'src/platforms/metadata-shared.ts',
  'src/platforms/claude/metadata.ts',
  'src/tooling/runtime-payload-contract.ts',
];

const FORBIDDEN_RUNTIME_TEST_PATHS = [
  'claude/scripts/policy-enforcer.test.js',
  'plugins/maestro/skills/server.spec.js',
  'claude/scripts/__tests__/fixture.js',
];

const FORBIDDEN_DETACHED_PAYLOAD_FILES = [
  'claude/src/mcp/maestro-server.js',
  'claude/src/version.json',
  'plugins/maestro/src/mcp/maestro-server.js',
  'plugins/maestro/src/version.json',
];

function sourcePathToDistPath(sourcePath) {
  return `dist/${sourcePath.endsWith('.ts') ? sourcePath.slice(0, -3) + '.js' : sourcePath}`;
}

const BUILD_ONLY_DIST_PATHS = BUILD_ONLY_SOURCE_PATHS.map(sourcePathToDistPath);
const BUILD_ONLY_SOURCE_ARCHIVE_PATHS = BUILD_ONLY_SOURCE_PATHS.map((sourcePath) => `./${sourcePath}`);
const BUILD_ONLY_DIST_ARCHIVE_PATHS = BUILD_ONLY_SOURCE_ARCHIVE_PATHS.map((sourcePath) =>
  sourceArchivePathToDistArchivePath(sourcePath)
);

function sourceArchivePathToDistArchivePath(sourcePath) {
  return sourcePathToDistPath(sourcePath.slice(2)).replace(/^/, './');
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function packageFiles(extraFiles = [], packageFields = {}) {
  return [{
    filename: 'pkg.tgz',
    size: 1,
    unpackedSize: 1,
    files: [...new Set([
      ...EXPECTED_REQUIRED_PACKAGE_FILES,
      ...extraFiles,
    ])].map((filePath) => ({ path: filePath })),
    ...packageFields,
  }];
}

export {
  BUILD_ONLY_DIST_ARCHIVE_PATHS,
  BUILD_ONLY_DIST_PATHS,
  BUILD_ONLY_SOURCE_ARCHIVE_PATHS,
  BUILD_ONLY_SOURCE_PATHS,
  EXPECTED_REQUIRED_PACKAGE_FILES,
  EXPECTED_PACKAGE_SCRIPT_LIFECYCLE,
  EXPECTED_RUNTIME_NAMES,
  FORBIDDEN_RUNTIME_TEST_PATHS,
  RAW_DIST_CONTENT_PATHS,
  RAW_DIST_CONTENT_ROOTS,
  RELEASE_ONLY_PACKAGE_DOCS,
  FORBIDDEN_DETACHED_PAYLOAD_FILES,
  ROOT,
  VALID_ARTIFACT_SCOPES,
  escaped,
  packageFiles,
  packageJson,
};
