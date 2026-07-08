import path from 'path';
import { resolveRuntimeContentFromExtensionRoot } from '../utils/extension-root.js';
import { hasRuntimeContentRegistry, readResourceFromFilesystem, readResourceFromRegistry, readAgentFromFilesystem, readAgentFromRegistry, } from './runtime-content.js';
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
function createRegistryProvider(runtimeConfig, canonicalSrcRoot = resolveRuntimeContentFromExtensionRoot()) {
    const srcRoot = path.resolve(canonicalSrcRoot);
    return {
        name: 'registry',
        srcRoot,
        readResource(id) {
            return readResourceFromRegistry(id, runtimeConfig, srcRoot);
        },
        readAgent(agentName) {
            return readAgentFromRegistry(agentName, runtimeConfig, srcRoot);
        },
    };
}
function createContentProvider(runtimeConfig, canonicalSrcRoot = resolveRuntimeContentFromExtensionRoot()) {
    const srcRoot = path.resolve(canonicalSrcRoot);
    if (hasRuntimeContentRegistry(srcRoot)) {
        return createRegistryProvider(runtimeConfig, srcRoot);
    }
    return createFilesystemProvider(runtimeConfig, srcRoot);
}
export { createContentProvider, createFilesystemProvider, createRegistryProvider };
