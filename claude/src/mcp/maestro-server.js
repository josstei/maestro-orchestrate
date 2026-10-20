'use strict';

const { log, fatal } = require('../core/logger');
const { resolveVersion } = require('../core/version');
const { createServer, toolFailure } = require('./core/create-server');
const { createLineDispatcher } = require('./core/line-reader');
const { createProjectRootCache } = require('./core/project-root-cache');
const { createProtocolHandlers } = require('./core/protocol-dispatcher');
const { createToolPack: createWorkspaceToolPack } = require('./tool-packs/workspace');
const { createToolPack: createSessionToolPack } = require('./tool-packs/session');
const { createToolPack: createContentToolPack } = require('./tool-packs/content');
const { RUNTIME_NAMES, getRuntimeConfig, findRuntimeConfigForClient } = require('../platforms/runtime-config-map');

const SERVER_INFO = Object.freeze({
  name: 'maestro',
  version: resolveVersion(__dirname),
});

const DEFAULT_TOOL_PACKS = Object.freeze([
  createWorkspaceToolPack,
  createSessionToolPack,
  createContentToolPack,
]);

/** The RUNTIME_UNIDENTIFIED failure, saying why `session` has no runtime. */
function runtimeUnidentified(session) {
  let reason = 'MCP client has not sent initialize yet';
  if (session) {
    const clientName = session.clientInfo && typeof session.clientInfo.name === 'string'
      ? session.clientInfo.name
      : null;
    reason = clientName
      ? `MCP client "${clientName}" is not one Maestro recognizes`
      : 'MCP client sent no clientInfo.name';
  }
  return toolFailure(
    `Maestro could not identify its host runtime: MAESTRO_RUNTIME is not set and the ${reason}.`,
    'RUNTIME_UNIDENTIFIED',
    `Set MAESTRO_RUNTIME to one of: ${RUNTIME_NAMES.join(', ')}.`
  );
}

/**
 * Serve Maestro over stdio. The host runtime is identified, never assumed:
 * MAESTRO_RUNTIME when it is set (an unknown value fails at startup),
 * otherwise the runtime whose config lists the MCP client's `clientInfo.name`
 * from `initialize`. The runtime-bound server is assembled once the runtime is
 * known (at startup for MAESTRO_RUNTIME, otherwise at `initialize`); when no
 * runtime is identified, the tools are listed but every call fails with
 * RUNTIME_UNIDENTIFIED.
 */
function main() {
  const explicitRuntimeConfig = process.env.MAESTRO_RUNTIME
    ? getRuntimeConfig(process.env.MAESTRO_RUNTIME)
    : null;
  let session = null;

  function startSession(clientInfo = null) {
    const runtimeConfig = explicitRuntimeConfig || findRuntimeConfigForClient(clientInfo);
    const cache = createProjectRootCache({
      runtimeConfig,
      requestClientRoots: () => handlers.requestFromClient('roots/list', {}),
    });
    const server = createServer({
      runtimeConfig: runtimeConfig || {},
      services: {
        workspaceSuggestion: cache.workspaceSuggestion,
        setWorkspacePath: cache.setExplicitWorkspacePath,
      },
      toolPacks: DEFAULT_TOOL_PACKS,
    });

    const started = { runtimeConfig, clientInfo, cache, server };
    if (runtimeConfig) {
      const source = explicitRuntimeConfig ? 'MAESTRO_RUNTIME' : `MCP client "${clientInfo.name}"`;
      log('info', `Runtime ${runtimeConfig.name}, identified from ${source}`);
    } else {
      log('error', runtimeUnidentified(started).error);
    }
    return started;
  }

  const server = {
    getToolSchemas: () => (session ? session.server.getToolSchemas() : []),
    callTool(name, args, projectRoot) {
      if (!session || !session.runtimeConfig) {
        return runtimeUnidentified(session);
      }
      return session.server.callTool(name, args, projectRoot);
    },
  };

  // An explicit MAESTRO_RUNTIME is known before the client connects.
  if (explicitRuntimeConfig) session = startSession();

  async function refreshClientRoots() {
    if (session) await session.cache.refreshClientRoots();
  }

  const handlers = createProtocolHandlers(
    server,
    () => (session ? session.cache.getProjectRoot() : null),
    process.stdout,
    {
      serverInfo: SERVER_INFO,
      callbacks: {
        onInitialize(params) {
          session = session || startSession(params.clientInfo);
          session.cache.setClientSupportsRoots(Boolean(params.capabilities && params.capabilities.roots));
        },
        onInitialized: refreshClientRoots,
        // Re-read the roots instead of only forgetting them: Antigravity sends
        // list_changed again right after answering roots/list, which would
        // otherwise leave the suggestion on the server cwd (the plugin dir).
        onRootsListChanged: refreshClientRoots,
      },
    }
  );

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
