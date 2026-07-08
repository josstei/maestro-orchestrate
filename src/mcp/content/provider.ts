import path from 'path';
import { resolveRuntimeContentFromExtensionRoot } from '../utils/extension-root.js';
import { readResourceFromFilesystem, readAgentFromFilesystem } from './runtime-content.js';

function createFilesystemProvider(
  runtimeConfig: any,
  canonicalSrcRoot: any = resolveRuntimeContentFromExtensionRoot()
) {
  const srcRoot = path.resolve(canonicalSrcRoot);

  return {
    name: 'filesystem',
    srcRoot,

    readResource(id: any) {
      return readResourceFromFilesystem(id, runtimeConfig, srcRoot);
    },

    readAgent(agentName: any) {
      return readAgentFromFilesystem(agentName, runtimeConfig, srcRoot);
    },
  };
}

function createContentProvider(runtimeConfig: any, canonicalSrcRoot: any = resolveRuntimeContentFromExtensionRoot()) {
  return createFilesystemProvider(runtimeConfig, canonicalSrcRoot);
}

export { createContentProvider, createFilesystemProvider };
