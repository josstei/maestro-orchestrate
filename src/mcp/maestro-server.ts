import { log, fatal } from '../core/logger.js';
import { resolveVersion } from '../core/version.js';
import { createMcpServer, startMcpServer } from './server/create-mcp-server.js';
import { createMaestroToolRegistry } from './tool-packs/contracts.js';
import { createProjectRootCache } from './server/project-root-cache.js';
import { ROOTS_LIST_CHANGED_NOTIFICATION_SCHEMA } from './server/mcp-sdk-adapter.js';

import { DEFAULT_TOOL_PACKS } from './tool-packs/index.js';
import { getDefaultRuntimeConfig, normalizeRuntimeConfig } from './runtime/runtime-config-map.js';
import { resolveCanonicalSrcFromExtensionRoot } from './utils/extension-root.js';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { moduleDirname } from '../core/module-path.js';

const SERVER_INFO = Object.freeze({
  name: 'maestro',
  version: resolveVersion(moduleDirname(import.meta.url)),
});

function runRuntimeServer(runtimeConfig: any, options: any = {}) {
  const resolvedRuntimeConfig = normalizeRuntimeConfig(runtimeConfig);
  const canonicalSrcRoot =
    options.canonicalSrcRoot || resolveCanonicalSrcFromExtensionRoot();
  const toolPacks = Array.isArray(options.toolPacks)
    ? options.toolPacks
    : DEFAULT_TOOL_PACKS;

  const server = options.server || createMcpServer();
  const registry = createMaestroToolRegistry();

  const cache = createProjectRootCache({
    runtimeConfig: resolvedRuntimeConfig,
    requestClientRoots: async () => {
      const lowLevelServer = server.server;
      if (!lowLevelServer || typeof lowLevelServer.listRoots !== 'function') {
        return { roots: [] };
      }
      return lowLevelServer.listRoots();
    },
  });

  server.server.oninitialized = () => {
    const capabilities = server.server.getClientCapabilities();
    cache.setClientSupportsRoots(Boolean(capabilities && capabilities.roots));
    cache.refreshClientRoots().catch(() => {});
  };

  server.server.setNotificationHandler(ROOTS_LIST_CHANGED_NOTIFICATION_SCHEMA, () => {
    cache.invalidateClientRoots();
  });

  const contextOptions = {
    runtimeConfig: resolvedRuntimeConfig,
    getProjectRoot: () => cache.resolveProjectRoot(),
    services: {
      canonicalSrcRoot,
      workspaceSuggestion: () => cache.workspaceSuggestion(),
    },
  };

  for (const registerPack of toolPacks) {
    registerPack({
      server,
      registry,
      onInitializeWorkspace(result: any) {
        if (result && result.success && result.workspace_path) {
          cache.setExplicitWorkspacePath(result.workspace_path);
        }
      },
      ...contextOptions,
    });
  }

  log('info', 'MCP server starting');

  return {
    async connect() {
      await startMcpServer(server);
      log('info', 'MCP server connected');
    },
    server,
  };
}

async function main(runtimeConfig?: any) {
  const resolved =
    runtimeConfig || process.env.MAESTRO_RUNTIME || getDefaultRuntimeConfig();
  const instance = runRuntimeServer(resolved);
  await instance.connect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error: any) => {
    fatal(error && error.message ? error.message : String(error));
  });
}

export { SERVER_INFO, normalizeRuntimeConfig, runRuntimeServer, main };
