import path from 'path';
import { resolveRuntimeContentFromExtensionRoot } from '../utils/extension-root.js';
import { readResourceFromFilesystem, readAgentFromFilesystem } from './runtime-content.js';
function createFilesystemProvider(runtimeConfig, canonicalSrcRoot = resolveRuntimeContentFromExtensionRoot()) {
    const srcRoot = path.resolve(canonicalSrcRoot);
    return {
        name: 'filesystem',
        srcRoot,
        readResource(id) {
            return readResourceFromFilesystem(id, runtimeConfig, srcRoot);
        },
        readAgent(agentName) {
            return readAgentFromFilesystem(agentName, runtimeConfig, srcRoot);
        },
    };
}
function createContentProvider(runtimeConfig, canonicalSrcRoot = resolveRuntimeContentFromExtensionRoot()) {
    return createFilesystemProvider(runtimeConfig, canonicalSrcRoot);
}
export { createContentProvider, createFilesystemProvider };
