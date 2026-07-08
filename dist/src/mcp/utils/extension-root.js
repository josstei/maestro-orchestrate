import path from 'path';
import { resolveCanonicalProjectRoot, resolveRuntimeContentRoot } from '../../core/canonical-source.js';
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
function resolveRuntimeContentFromExtensionRoot() {
    return resolveRuntimeContentRoot(resolveRepoRoot());
}
function resolveCanonicalSrcFromExtensionRoot() {
    return resolveRuntimeContentFromExtensionRoot();
}
export { resolveCanonicalSrcFromExtensionRoot, resolveExtensionRoot, resolveRepoRoot, resolveRuntimeContentFromExtensionRoot, };
