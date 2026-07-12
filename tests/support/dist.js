import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, repoPath } from './paths.js';

const ROOT = REPO_ROOT;
const DIST_ROOT = repoPath('dist');

const REQUIRED_DIST_FILES = Object.freeze([
  'src/bin/maestro-install-codex.js',
  'src/bin/maestro-mcp-server.js',
  'src/tooling/generate.js',
  'src/tooling/verify-npm-pack.js',
  'src/mcp/maestro-server.js',
  'src/mcp/content/runtime-content.js',
]);

function distPath(...parts) {
  return path.join(DIST_ROOT, ...parts);
}

function missingDistFiles(requiredFiles) {
  return requiredFiles.filter((relativePath) => !fs.existsSync(distPath(relativePath)));
}

function assertDistBuilt(requiredFiles = REQUIRED_DIST_FILES) {
  const missing = missingDistFiles(requiredFiles);

  if (missing.length > 0) {
    throw new Error(
      `Compiled dist output is missing. Run \`npm run build\` first. Missing: ${missing.join(', ')}`
    );
  }
}

function distModuleUrl(...parts) {
  const resolvedPath = distPath(...parts);
  assertDistBuilt([parts.join('/')]);

  return pathToFileURL(resolvedPath).href;
}

async function importDist(...parts) {
  return import(distModuleUrl(...parts));
}

export { DIST_ROOT, REQUIRED_DIST_FILES, ROOT, assertDistBuilt, distModuleUrl, distPath, importDist };
