import path from 'path';
import { resolveCanonicalProjectRoot, resolveCanonicalSrcRoot } from '../../core/canonical-source.js';

function resolveExtensionRoot() {
  if (process.env.MAESTRO_EXTENSION_PATH) {
    return process.env.MAESTRO_EXTENSION_PATH;
  }

  const serverFile = process.argv[1];
  if (serverFile) {
    return path.resolve(path.dirname(serverFile), '..');
  }

  return process.cwd();
}

function resolveRepoRoot() {
  return resolveCanonicalProjectRoot(resolveExtensionRoot());
}

function resolveCanonicalSrcFromExtensionRoot() {
  return resolveCanonicalSrcRoot(resolveExtensionRoot());
}

export { resolveCanonicalSrcFromExtensionRoot, resolveExtensionRoot, resolveRepoRoot };
