'use strict';

const { log } = require('../core/logger');
const { resolveVersion } = require('../core/version');
const { createServer, toolFailure } = require('./core/create-server');
const { createProjectRootCache } = require('./core/project-root-cache');
const { createProtocolHandlers } = require('./core/protocol-dispatcher');
const { tools: workspaceTools } = require('./tools/workspace');
const { tools: sessionTools } = require('./tools/session');
const { tools: contentTools } = require('./tools/content');
const { RUNTIME_NAMES, getRuntimeConfig, findRuntimeConfigForClient } = require('../platforms/runtime-config-map');

const SERVER_INFO = Object.freeze({
  name: 'maestro',
  version: resolveVersion(),
});

// The listed tool order: workspace, session, then content tools.
const TOOLS = [...workspaceTools, ...sessionTools, ...contentTools];

/** The RUNTIME_UNIDENTIFIED failure, saying why `session` has no runtime. */
function runtimeUnidentified(session) {
  let reason = 'MCP client has not sent initialize yet';
  if (session) {
    reason = session.clientName
      ? `MCP client "${session.clientName}" is not one Maestro recognizes`
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
  const cache = createProjectRootCache({
    requestClientRoots: () => protocol.requestFromClient('roots/list', {}),
  });
  let session = null;

  function startSession(clientName = null) {
    const runtimeConfig = explicitRuntimeConfig || findRuntimeConfigForClient(clientName);
    // Without a runtime the tools are still listed, but no handler runs.
    const server = createServer({ runtimeConfig: runtimeConfig || {}, workspace: cache, tools: TOOLS });

    const started = { runtimeConfig, clientName, server };
    if (runtimeConfig) {
      const source = explicitRuntimeConfig ? 'MAESTRO_RUNTIME' : `MCP client "${clientName}"`;
      log('info', `Runtime ${runtimeConfig.name}, identified from ${source}`);
    } else {
      log('error', runtimeUnidentified(started).error);
    }
    return started;
  }

  const server = {
    getToolSchemas: () => (session ? session.server.getToolSchemas() : []),
    callTool(name, args) {
      if (!session || !session.runtimeConfig) {
        return runtimeUnidentified(session);
      }
      return session.server.callTool(name, args, cache.getProjectRoot());
    },
  };

  // An explicit MAESTRO_RUNTIME is known before the client connects.
  if (explicitRuntimeConfig) session = startSession();

  const protocol = createProtocolHandlers(server, process.stdout, {
    serverInfo: SERVER_INFO,
    callbacks: {
      onInitialize(params) {
        const { clientInfo } = params;
        const clientName = clientInfo && typeof clientInfo.name === 'string' ? clientInfo.name : null;
        session = session || startSession(clientName);
        cache.setClientSupportsRoots(Boolean(params.capabilities && params.capabilities.roots));
      },
      onInitialized: cache.refreshClientRoots,
      // Re-read the roots instead of only forgetting them: Antigravity sends
      // list_changed again right after answering roots/list, which would
      // otherwise leave the suggestion on the server cwd (the plugin dir).
      onRootsListChanged: cache.refreshClientRoots,
    },
  });

  protocol.listen(process.stdin);

  log('info', 'MCP server starting');
  log('info', 'MCP server connected');
}

module.exports = {
  main,
};
