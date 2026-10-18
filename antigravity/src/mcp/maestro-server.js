'use strict';

const { log, fatal } = require('../core/logger');
const { resolveVersion } = require('../core/version');
const { createServer } = require('./core/create-server');
const { createLineDispatcher } = require('./core/line-reader');
const { createProjectRootCache } = require('./core/project-root-cache');
const { createProtocolHandlers } = require('./core/protocol-dispatcher');
const { createToolPack: createWorkspaceToolPack } = require('./tool-packs/workspace');
const { createToolPack: createSessionToolPack } = require('./tool-packs/session');
const { createToolPack: createContentToolPack } = require('./tool-packs/content');
const { RUNTIME_NAMES, getRuntimeConfig } = require('./runtime/runtime-config-map');

const SERVER_INFO = Object.freeze({
  name: 'maestro',
  version: resolveVersion(__dirname),
});

const DEFAULT_TOOL_PACKS = Object.freeze([
  createWorkspaceToolPack,
  createSessionToolPack,
  createContentToolPack,
]);

function main() {
  const resolvedRuntimeConfig = getRuntimeConfig(process.env.MAESTRO_RUNTIME || RUNTIME_NAMES[0]);

  const cache = createProjectRootCache({
    runtimeConfig: resolvedRuntimeConfig,
    requestClientRoots: () => handlers.requestFromClient('roots/list', {}),
  });

  const server = createServer({
    runtimeConfig: resolvedRuntimeConfig,
    services: {
      workspaceSuggestion: cache.workspaceSuggestion,
      setWorkspacePath: cache.setExplicitWorkspacePath,
    },
    toolPacks: DEFAULT_TOOL_PACKS,
  });

  const handlers = createProtocolHandlers(server, cache.getProjectRoot, process.stdout, {
    serverInfo: SERVER_INFO,
    callbacks: {
      onInitialize(params) {
        cache.setClientSupportsRoots(Boolean(params.capabilities && params.capabilities.roots));
      },
      async onInitialized() {
        await cache.refreshClientRoots();
      },
      // Re-read the roots instead of only forgetting them: Antigravity sends
      // list_changed again right after answering roots/list, which would
      // otherwise leave the suggestion on the server cwd (the plugin dir).
      async onRootsListChanged() {
        await cache.refreshClientRoots();
      },
    },
  });

  createLineDispatcher(process.stdin, (message) => {
    handlers.respond(message).catch((error) => {
      log('error', `Failed to handle MCP message: ${error.message}`);
    });
  });

  log('info', 'MCP server starting');
  log('info', 'MCP server connected');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    fatal(error && error.message ? error.message : String(error));
  }
}

module.exports = {
  DEFAULT_TOOL_PACKS,
  main,
};
