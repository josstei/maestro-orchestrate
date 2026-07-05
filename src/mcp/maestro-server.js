import { log, fatal } from '../core/logger.js';
import { resolveVersion } from '../core/version.js';
import { createMcpServer, startMcpServer } from './server/create-mcp-server.js';
import { createMaestroToolRegistry } from './tool-packs/contracts.js';
import { createProjectRootCache } from './core/project-root-cache.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

import { DEFAULT_TOOL_PACKS } from './tool-packs/index.js';
import { getDefaultRuntimeConfig, normalizeRuntimeConfig } from './runtime/runtime-config-map.js';
import { resolveCanonicalSrcFromExtensionRoot } from './utils/extension-root.js';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
import { dirname } from 'node:path';
const moduleDirname = dirname(moduleFilename);

const SERVER_INFO = Object.freeze({
  name: 'maestro',
  version: resolveVersion(moduleDirname),
});

function runRuntimeServer(runtimeConfig, options = {}) {
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

  server.server.setNotificationHandler(RootsListChangedNotificationSchema, () => {
    cache.invalidateClientRoots();
  });

  const contextOptions = {
    server,
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
      onInitializeWorkspace(result) {
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

async function main(runtimeConfig) {
  const resolved =
    runtimeConfig || process.env.MAESTRO_RUNTIME || getDefaultRuntimeConfig();
  const instance = runRuntimeServer(resolved);
  await instance.connect();
}

if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => {
    fatal(error && error.message ? error.message : String(error));
  });
}

export { SERVER_INFO, normalizeRuntimeConfig, runRuntimeServer, main };
