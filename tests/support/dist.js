import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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

let buildAttempted = false;

function distPath(...parts) {
  return path.join(DIST_ROOT, ...parts);
}

function missingDistFiles(requiredFiles) {
  return requiredFiles.filter((relativePath) => !fs.existsSync(distPath(relativePath)));
}

function ensureDistBuilt(requiredFiles = REQUIRED_DIST_FILES) {
  const missing = missingDistFiles(requiredFiles);

  if (missing.length === 0) {
    return;
  }

  if (!buildAttempted) {
    buildAttempted = true;
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  }

  const stillMissing = missingDistFiles(requiredFiles);

  if (stillMissing.length > 0) {
    throw new Error(
      `Compiled dist output is missing after \`npm run build\`. Missing: ${stillMissing.join(', ')}`
    );
  }
}

function assertDistBuilt(requiredFiles = REQUIRED_DIST_FILES) {
  ensureDistBuilt(requiredFiles);
}

function distModuleUrl(...parts) {
  const resolvedPath = distPath(...parts);
  assertDistBuilt([parts.join('/')]);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Compiled dist module is missing after \`npm run build\`: ${path.relative(ROOT, resolvedPath)}.`
    );
  }

  return pathToFileURL(resolvedPath).href;
}

async function importDist(...parts) {
  return import(distModuleUrl(...parts));
}

export { DIST_ROOT, REQUIRED_DIST_FILES, ROOT, assertDistBuilt, distModuleUrl, distPath, ensureDistBuilt, importDist };
