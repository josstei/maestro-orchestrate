import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../..');
const DIST_ROOT = path.join(ROOT, 'dist');

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

function assertDistBuilt(requiredFiles = REQUIRED_DIST_FILES) {
  const missing = requiredFiles.filter((relativePath) => !fs.existsSync(distPath(relativePath)));

  if (missing.length > 0) {
    throw new Error(
      `Compiled dist output is missing. Run \`npm run build\` before dist-targeted tests. Missing: ${missing.join(', ')}`
    );
  }
}

function distModuleUrl(...parts) {
  const resolvedPath = distPath(...parts);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Compiled dist module is missing: ${path.relative(ROOT, resolvedPath)}. Run \`npm run build\` before dist-targeted tests.`
    );
  }

  return pathToFileURL(resolvedPath).href;
}

async function importDist(...parts) {
  return import(distModuleUrl(...parts));
}

export { DIST_ROOT, REQUIRED_DIST_FILES, ROOT, assertDistBuilt, distModuleUrl, distPath, importDist };
