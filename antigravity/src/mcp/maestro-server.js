'use strict';

const { log, fatal } = require('../core/logger');
const { resolveVersion } = require('../core/version');
const { createServer, toolFailure } = require('./core/create-server');
const { createProjectRootCache } = require('./core/project-root-cache');
const { McpConnection } = require('./core/protocol-dispatcher');
const { createToolPack: createWorkspaceToolPack } = require('./tool-packs/workspace');
const { createToolPack: createSessionToolPack } = require('./tool-packs/session');
const { createToolPack: createContentToolPack } = require('./tool-packs/content');
const { RUNTIME_NAMES, getRuntimeConfig, findRuntimeConfigForClient } = require('../platforms/runtime-config-map');

const SERVER_INFO = Object.freeze({
  name: 'maestro',
  version: resolveVersion(),
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
 * Maestro's MCP server. The host runtime is identified, never assumed:
 * MAESTRO_RUNTIME when it is set (an unknown value fails at startup),
 * otherwise the runtime whose config lists the MCP client's `clientInfo.name`
 * from `initialize`. The runtime-bound server is assembled once the runtime is
 * known (at startup for MAESTRO_RUNTIME, otherwise at `initialize`); when no
 * runtime is identified, the tools are listed but every call fails with
 * RUNTIME_UNIDENTIFIED.
 */
class MaestroServer extends McpConnection {
  constructor(output, explicitRuntimeConfig) {
    super(output, { serverInfo: SERVER_INFO });
    this.explicitRuntimeConfig = explicitRuntimeConfig;
    // An explicit MAESTRO_RUNTIME is known before the client connects.
    this.session = explicitRuntimeConfig ? this.startSession() : null;
  }

  startSession(clientInfo = null) {
    const runtimeConfig = this.explicitRuntimeConfig || findRuntimeConfigForClient(clientInfo);
    const cache = createProjectRootCache({
      runtimeConfig,
      requestClientRoots: () => this.requestFromClient('roots/list', {}),
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
      const source = this.explicitRuntimeConfig ? 'MAESTRO_RUNTIME' : `MCP client "${clientInfo.name}"`;
      log('info', `Runtime ${runtimeConfig.name}, identified from ${source}`);
    } else {
      log('error', runtimeUnidentified(started).error);
    }
    return started;
  }

  getToolSchemas() {
    return this.session ? this.session.server.getToolSchemas() : [];
  }

  callTool(name, args, projectRoot) {
    if (!this.session || !this.session.runtimeConfig) {
      return runtimeUnidentified(this.session);
    }
    return this.session.server.callTool(name, args, projectRoot);
  }

  getProjectRoot() {
    return this.session ? this.session.cache.getProjectRoot() : null;
  }

  onInitialize(params) {
    this.session = this.session || this.startSession(params.clientInfo);
    this.session.cache.setClientSupportsRoots(Boolean(params.capabilities && params.capabilities.roots));
  }

  async onInitialized() {
    if (this.session) await this.session.cache.refreshClientRoots();
  }

  // Re-read the roots instead of only forgetting them: Antigravity sends
  // list_changed again right after answering roots/list, which would
  // otherwise leave the suggestion on the server cwd (the plugin dir).
  onRootsListChanged() {
    return this.onInitialized();
  }
}

/** Serve Maestro over stdio. */
function main() {
  const explicitRuntimeConfig = process.env.MAESTRO_RUNTIME
    ? getRuntimeConfig(process.env.MAESTRO_RUNTIME)
    : null;
  new MaestroServer(process.stdout, explicitRuntimeConfig).listen(process.stdin);

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
