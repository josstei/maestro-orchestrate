import fs, { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_PACKAGE_FILES } from '../../dist/src/tooling/release-artifact-manifest.js';

const moduleFilename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(moduleFilename), '../..');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));

const VALID_ARTIFACT_SCOPES = new Set(['both', 'npm', 'release']);

const RELEASE_ONLY_PACKAGE_DOCS = [
  'CHANGELOG.md',
  'EXAMPLES.md',
  'docs/architecture.md',
  'docs/cicd.md',
  'docs/flow.md',
  'docs/maestro-cheatsheet.md',
  'docs/overview.md',
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
  'src/entry-points/registry.js',
  'src/lib/discovery/index.ts',
  'src/lib/yaml-emit.ts',
  'src/manifest.js',
  'src/platforms/metadata.ts',
  'src/platforms/metadata-shared.ts',
  'src/platforms/claude/metadata.ts',
  'src/platforms/runtime-payload-contract.ts',
];

const FORBIDDEN_RUNTIME_TEST_PATHS = [
  'claude/scripts/policy-enforcer.test.js',
  'plugins/maestro/skills/server.spec.js',
  'claude/scripts/__tests__/fixture.js',
];

const RETIRED_DETACHED_PAYLOAD_FILES = [
  'claude/src/mcp/maestro-server.js',
  'claude/src/version.json',
  'plugins/maestro/src/mcp/maestro-server.js',
  'plugins/maestro/src/version.json',
];

const REMOVED_STATE_HELPER_SCRIPTS = [
  removedRuntimePath('src', 'scripts', ['ensure', 'workspace'].join('-') + '.js'),
  removedRuntimePath('src', 'scripts', ['read', 'active', 'session'].join('-') + '.js'),
  removedRuntimePath('src', 'scripts', ['read', 'state'].join('-') + '.js'),
  removedRuntimePath('src', 'scripts', ['write', 'state'].join('-') + '.js'),
  removedRuntimePath('src', 'scripts', ['read', 'setting'].join('-') + '.js'),
];

const REMOVED_SHARED_AGENT_NAMES_MODULE = removedRuntimePath(
  'src',
  'platforms',
  'shared',
  ['agent', 'names'].join('-') + '.js'
);

function removedRuntimePath(...parts) {
  return parts.join('/');
}

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
      ...REQUIRED_PACKAGE_FILES,
      ...extraFiles,
    ])].map((filePath) => ({ path: filePath })),
    ...packageFields,
  }];
}

function runtimeConfigNames() {
  return fs.readdirSync(path.join(ROOT, 'src', 'platforms'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
    .filter((entry) => fs.existsSync(path.join(ROOT, 'src', 'platforms', entry.name, 'runtime-config.ts')))
    .map((entry) => entry.name)
    .sort();
}

export {
  BUILD_ONLY_DIST_ARCHIVE_PATHS,
  BUILD_ONLY_DIST_PATHS,
  BUILD_ONLY_SOURCE_ARCHIVE_PATHS,
  BUILD_ONLY_SOURCE_PATHS,
  FORBIDDEN_RUNTIME_TEST_PATHS,
  RAW_DIST_CONTENT_PATHS,
  RAW_DIST_CONTENT_ROOTS,
  RELEASE_ONLY_PACKAGE_DOCS,
  REMOVED_SHARED_AGENT_NAMES_MODULE,
  REMOVED_STATE_HELPER_SCRIPTS,
  REQUIRED_PACKAGE_FILES,
  RETIRED_DETACHED_PAYLOAD_FILES,
  ROOT,
  VALID_ARTIFACT_SCOPES,
  escaped,
  packageFiles,
  packageJson,
  removedRuntimePath,
  runtimeConfigNames,
  sourceArchivePathToDistArchivePath,
  sourcePathToDistPath,
};
