import path from 'path';
import { resolveRuntimeContentFromExtensionRoot } from '../utils/extension-root.js';
import {
  readResourceFromFilesystem,
  readAgentFromFilesystem,
  materializeAgent,
  materializeResource,
} from './runtime-content.js';
import {
  createRuntimeContentSnapshot,
  hasRuntimeContentRegistry,
} from './runtime-content-snapshot.js';

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

function createRegistryProvider(
  runtimeConfig: any,
  canonicalSrcRoot: any = resolveRuntimeContentFromExtensionRoot()
) {
  const srcRoot = path.resolve(canonicalSrcRoot);
  const snapshot = createRuntimeContentSnapshot(srcRoot);

  return {
    name: 'registry',
    srcRoot,

    readResource(id: any) {
      const resource = snapshot.readResource(id);
      return 'error' in resource
        ? resource
        : materializeResource(resource, runtimeConfig, srcRoot);
    },

    readAgent(agentName: any) {
      const agent = snapshot.readAgent(agentName);
      return 'error' in agent ? agent : materializeAgent(agent, runtimeConfig);
    },
  };
}

function createContentProvider(runtimeConfig: any, canonicalSrcRoot: any = resolveRuntimeContentFromExtensionRoot()) {
  const srcRoot = path.resolve(canonicalSrcRoot);
  if (hasRuntimeContentRegistry(srcRoot)) {
    return createRegistryProvider(runtimeConfig, srcRoot);
  }

  return createFilesystemProvider(runtimeConfig, srcRoot);
}

export { createContentProvider, createFilesystemProvider, createRegistryProvider };
