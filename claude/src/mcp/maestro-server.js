'use strict';

const { log, fatal } = require('../core/logger');
const { resolveVersion } = require('../core/version');
const { createServer } = require('./core/create-server');
const { createLineDispatcher } = require('./core/line-reader');
const { createProjectRootCache } = require('./core/project-root-cache');
const {
  DEFAULT_PROTOCOL_VERSION,
  buildInitializeResult,
  createToolErrorResult,
  createToolSuccessResult,
  createProtocolHandlers,
} = require('./core/protocol-dispatcher');
const { DEFAULT_TOOL_PACKS } = require('./tool-packs');
const {
  getDefaultRuntimeConfig,
  normalizeRuntimeConfig,
} = require('./runtime/runtime-config-map');
const { resolveCanonicalSrcFromExtensionRoot } = require('./utils/extension-root');

const SERVER_INFO = Object.freeze({
  name: 'maestro',
  version: resolveVersion(__dirname),
});

function createInitializeResult(protocolVersion) {
  return buildInitializeResult(protocolVersion, SERVER_INFO);
}

function runRuntimeServer(runtimeConfig, options = {}) {
  const resolvedRuntimeConfig = normalizeRuntimeConfig(runtimeConfig);
  const canonicalSrcRoot =
    options.canonicalSrcRoot || resolveCanonicalSrcFromExtensionRoot();
  const toolPacks = Array.isArray(options.toolPacks)
    ? options.toolPacks
    : DEFAULT_TOOL_PACKS;
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;

  let requestFromClient;
  const cache = createProjectRootCache({
    runtimeConfig: resolvedRuntimeConfig,
    requestClientRoots: () => requestFromClient('roots/list', {}),
  });

  const server = createServer({
    runtimeConfig: resolvedRuntimeConfig,
    services: {
      canonicalSrcRoot,
      workspaceSuggestion: () => cache.workspaceSuggestion(),
    },
    toolPacks,
  });

  const handlers = createProtocolHandlers(server, cache.getProjectRoot, stdout, {
    serverInfo: SERVER_INFO,
    callbacks: {
      onInitialize(params) {
        cache.setClientSupportsRoots(
          Boolean(params && params.capabilities && params.capabilities.roots)
        );
      },
      async onInitialized() {
        await cache.refreshClientRoots();
      },
      onRootsListChanged() {
        cache.invalidateClientRoots();
      },
    },
  });

  requestFromClient = handlers.requestFromClient;

  server.onToolCall('initialize_workspace', (result) => {
    if (result && result.success && result.workspace_path) {
      cache.setExplicitWorkspacePath(result.workspace_path);
    }
  });

  const lineReader = createLineDispatcher(stdin, (message) => {
    Promise.resolve(handlers.respond(message)).catch((error) => {
      log('error', `Failed to handle MCP message: ${error.message}`);
    });
  });

  log('info', 'MCP server starting');
  log('info', 'MCP server connected');

  return {
    close() {
      lineReader.close();
      handlers.drain();
    },
    server,
  };
}

function main(runtimeConfig) {
  const resolved =
    runtimeConfig || process.env.MAESTRO_RUNTIME || getDefaultRuntimeConfig();
  runRuntimeServer(resolved);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    fatal(error && error.message ? error.message : String(error));
  }
}

module.exports = {
  DEFAULT_PROTOCOL_VERSION,
  SERVER_INFO,
  createInitializeResult,
  createToolErrorResult,
  createToolSuccessResult,
  normalizeRuntimeConfig,
  runRuntimeServer,
  main,
};
