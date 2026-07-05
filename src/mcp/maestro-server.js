import { log, fatal } from '../core/logger.js';
import { resolveVersion } from '../core/version.js';
import { createServer } from './core/create-server.js';
import { createLineDispatcher } from './core/line-reader.js';
import { createProjectRootCache } from './core/project-root-cache.js';

import {
  DEFAULT_PROTOCOL_VERSION,
  buildInitializeResult,
  createToolErrorResult,
  createToolSuccessResult,
  createProtocolHandlers,
} from './core/protocol-dispatcher.js';

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

if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    fatal(error && error.message ? error.message : String(error));
  }
}

export { DEFAULT_PROTOCOL_VERSION, SERVER_INFO, createInitializeResult, createToolErrorResult, createToolSuccessResult, normalizeRuntimeConfig, runRuntimeServer, main };
