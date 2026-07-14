import path from 'node:path';
import { resolveRuntimeContentFromExtensionRoot } from '../utils/extension-root.js';
import { materializeAgent, materializeResource } from './runtime-content.js';
import { createRuntimeContentSnapshot } from './runtime-content-snapshot.js';

function createContentProvider(
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

export { createContentProvider };
