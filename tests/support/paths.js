import path from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveFrom(moduleUrl, ...parts) {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), ...parts);
}

const REPO_ROOT = resolveFrom(import.meta.url, '../..');

function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

export { REPO_ROOT, repoPath, resolveFrom };
